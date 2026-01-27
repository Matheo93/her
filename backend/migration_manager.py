"""
Migration Manager - Sprint 801

Database migration utilities.

Features:
- Version tracking
- Up/down migrations
- Migration history
- Rollback support
- SQL file support
- Seed data
"""

import os
import time
import hashlib
import re
from dataclasses import dataclass, field
from typing import (
    Dict, List, Any, Optional, Callable, TypeVar, Union,
    Awaitable, Type
)
from enum import Enum
from abc import ABC, abstractmethod
import logging
from datetime import datetime
from pathlib import Path
import threading

logger = logging.getLogger(__name__)


T = TypeVar("T")


class MigrationStatus(str, Enum):
    """Migration status."""
    PENDING = "pending"
    APPLIED = "applied"
    FAILED = "failed"
    ROLLED_BACK = "rolled_back"


@dataclass
class MigrationRecord:
    """Record of an applied migration."""
    version: str
    name: str
    applied_at: float
    checksum: str
    status: MigrationStatus = MigrationStatus.APPLIED
    execution_time_ms: float = 0.0
    error: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "version": self.version,
            "name": self.name,
            "applied_at": self.applied_at,
            "applied_at_str": datetime.fromtimestamp(self.applied_at).isoformat(),
            "checksum": self.checksum,
            "status": self.status.value,
            "execution_time_ms": self.execution_time_ms,
            "error": self.error,
        }


class Migration(ABC):
    """Abstract migration class."""

    version: str = ""
    name: str = ""
    description: str = ""

    @abstractmethod
    async def up(self, ctx: "MigrationContext") -> None:
        """Apply migration."""
        pass

    @abstractmethod
    async def down(self, ctx: "MigrationContext") -> None:
        """Rollback migration."""
        pass

    def checksum(self) -> str:
        """Calculate checksum for migration content."""
        # Use version + name + class name as checksum base
        content = self.version + ":" + self.name + ":" + self.__class__.__name__
        return hashlib.md5(content.encode()).hexdigest()[:16]


class SqlMigration(Migration):
    """SQL-based migration."""

    up_sql: str = ""
    down_sql: str = ""

    async def up(self, ctx: "MigrationContext") -> None:
        if self.up_sql:
            await ctx.execute(self.up_sql)

    async def down(self, ctx: "MigrationContext") -> None:
        if self.down_sql:
            await ctx.execute(self.down_sql)

    def checksum(self) -> str:
        content = self.up_sql + self.down_sql
        return hashlib.md5(content.encode()).hexdigest()[:16]


class MigrationContext:
    """Context passed to migrations for database operations."""

    def __init__(self, connection: Any = None):
        self._connection = connection
        self._operations: List[str] = []

    async def execute(self, sql: str, params: Optional[tuple] = None) -> Any:
        """Execute SQL statement."""
        self._operations.append(sql[:100])
        if self._connection:
            if hasattr(self._connection, "execute"):
                return await self._connection.execute(sql, params or ())
        logger.debug("Execute: " + sql[:100])
        return None

    async def execute_many(self, sql: str, params_list: List[tuple]) -> None:
        """Execute SQL with multiple parameter sets."""
        self._operations.append(sql[:100] + " (x" + str(len(params_list)) + ")")
        if self._connection:
            if hasattr(self._connection, "executemany"):
                await self._connection.executemany(sql, params_list)
        logger.debug("Execute many: " + sql[:100])

    async def fetch_one(self, sql: str, params: Optional[tuple] = None) -> Optional[Any]:
        """Fetch one row."""
        if self._connection:
            if hasattr(self._connection, "fetchone"):
                await self._connection.execute(sql, params or ())
                return await self._connection.fetchone()
        return None

    async def fetch_all(self, sql: str, params: Optional[tuple] = None) -> List[Any]:
        """Fetch all rows."""
        if self._connection:
            if hasattr(self._connection, "fetchall"):
                await self._connection.execute(sql, params or ())
                return await self._connection.fetchall()
        return []

    @property
    def operations(self) -> List[str]:
        """Get list of operations performed."""
        return list(self._operations)


class MigrationStore(ABC):
    """Abstract store for migration history."""

    @abstractmethod
    async def initialize(self) -> None:
        """Initialize the store (create table if needed)."""
        pass

    @abstractmethod
    async def get_applied(self) -> List[MigrationRecord]:
        """Get all applied migrations."""
        pass

    @abstractmethod
    async def mark_applied(self, record: MigrationRecord) -> None:
        """Mark a migration as applied."""
        pass

    @abstractmethod
    async def mark_rolled_back(self, version: str) -> None:
        """Mark a migration as rolled back."""
        pass

    @abstractmethod
    async def get_version(self, version: str) -> Optional[MigrationRecord]:
        """Get a specific migration record."""
        pass


class InMemoryMigrationStore(MigrationStore):
    """In-memory migration store (for testing)."""

    def __init__(self):
        self._records: Dict[str, MigrationRecord] = {}

    async def initialize(self) -> None:
        pass

    async def get_applied(self) -> List[MigrationRecord]:
        return [r for r in self._records.values() if r.status == MigrationStatus.APPLIED]

    async def mark_applied(self, record: MigrationRecord) -> None:
        self._records[record.version] = record

    async def mark_rolled_back(self, version: str) -> None:
        if version in self._records:
            self._records[version].status = MigrationStatus.ROLLED_BACK

    async def get_version(self, version: str) -> Optional[MigrationRecord]:
        return self._records.get(version)


class SqliteMigrationStore(MigrationStore):
    """SQLite-based migration store."""

    def __init__(self, db_path: str = ":memory:"):
        self.db_path = db_path
        self._connection: Any = None

    async def initialize(self) -> None:
        import sqlite3
        self._connection = sqlite3.connect(self.db_path)
        self._connection.execute("""
            CREATE TABLE IF NOT EXISTS migrations (
                version TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                applied_at REAL NOT NULL,
                checksum TEXT NOT NULL,
                status TEXT NOT NULL,
                execution_time_ms REAL DEFAULT 0,
                error TEXT
            )
        """)
        self._connection.commit()

    async def get_applied(self) -> List[MigrationRecord]:
        cursor = self._connection.execute(
            "SELECT version, name, applied_at, checksum, status, execution_time_ms, error "
            "FROM migrations WHERE status = ? ORDER BY version",
            (MigrationStatus.APPLIED.value,)
        )
        rows = cursor.fetchall()
        return [
            MigrationRecord(
                version=row[0],
                name=row[1],
                applied_at=row[2],
                checksum=row[3],
                status=MigrationStatus(row[4]),
                execution_time_ms=row[5] or 0,
                error=row[6],
            )
            for row in rows
        ]

    async def mark_applied(self, record: MigrationRecord) -> None:
        self._connection.execute(
            "INSERT OR REPLACE INTO migrations "
            "(version, name, applied_at, checksum, status, execution_time_ms, error) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (record.version, record.name, record.applied_at, record.checksum,
             record.status.value, record.execution_time_ms, record.error)
        )
        self._connection.commit()

    async def mark_rolled_back(self, version: str) -> None:
        self._connection.execute(
            "UPDATE migrations SET status = ? WHERE version = ?",
            (MigrationStatus.ROLLED_BACK.value, version)
        )
        self._connection.commit()

    async def get_version(self, version: str) -> Optional[MigrationRecord]:
        cursor = self._connection.execute(
            "SELECT version, name, applied_at, checksum, status, execution_time_ms, error "
            "FROM migrations WHERE version = ?",
            (version,)
        )
        row = cursor.fetchone()
        if row:
            return MigrationRecord(
                version=row[0],
                name=row[1],
                applied_at=row[2],
                checksum=row[3],
                status=MigrationStatus(row[4]),
                execution_time_ms=row[5] or 0,
                error=row[6],
            )
        return None


class MigrationManager:
    """Database migration manager.

    Usage:
        manager = MigrationManager(store=SqliteMigrationStore("app.db"))

        # Register migrations
        manager.register(CreateUsersTable())
        manager.register(AddEmailIndex())

        # Or load from directory
        manager.load_from_directory("migrations/")

        # Run pending migrations
        await manager.migrate()

        # Rollback last migration
        await manager.rollback()

        # Get status
        status = await manager.status()
    """

    def __init__(
        self,
        store: Optional[MigrationStore] = None,
        connection: Any = None,
    ):
        self._store = store or InMemoryMigrationStore()
        self._connection = connection
        self._migrations: Dict[str, Migration] = {}
        self._lock = threading.RLock()

    async def initialize(self) -> None:
        """Initialize the migration system."""
        await self._store.initialize()

    def register(self, migration: Migration) -> None:
        """Register a migration."""
        with self._lock:
            if not migration.version:
                raise ValueError("Migration must have a version")
            self._migrations[migration.version] = migration

    def unregister(self, version: str) -> bool:
        """Unregister a migration."""
        with self._lock:
            if version in self._migrations:
                del self._migrations[version]
                return True
            return False

    def load_from_directory(self, path: Union[str, Path]) -> int:
        """Load SQL migrations from directory.

        Expected file format:
        - V001__create_users_table.sql (up)
        - V001__create_users_table_down.sql (down) [optional]
        """
        path = Path(path)
        if not path.exists():
            logger.warning("Migration directory not found: " + str(path))
            return 0

        loaded = 0
        pattern = re.compile(r"V(\d+)__(.+?)(?:_down)?\.sql$")

        files: Dict[str, Dict[str, str]] = {}

        for file in path.glob("V*.sql"):
            match = pattern.match(file.name)
            if not match:
                continue

            version = "V" + match.group(1)
            name = match.group(2)
            is_down = "_down.sql" in file.name

            if version not in files:
                files[version] = {"name": name, "up": "", "down": ""}

            if is_down:
                files[version]["down"] = file.read_text()
            else:
                files[version]["up"] = file.read_text()

        for version, data in sorted(files.items()):
            migration = type(
                "SqlMigration_" + version,
                (SqlMigration,),
                {
                    "version": version,
                    "name": data["name"],
                    "up_sql": data["up"],
                    "down_sql": data["down"],
                },
            )()
            self.register(migration)
            loaded += 1

        logger.info("Loaded " + str(loaded) + " migrations from " + str(path))
        return loaded

    async def get_pending(self) -> List[Migration]:
        """Get pending migrations."""
        applied = await self._store.get_applied()
        applied_versions = {r.version for r in applied}

        pending = []
        for version in sorted(self._migrations.keys()):
            if version not in applied_versions:
                pending.append(self._migrations[version])

        return pending

    async def migrate(self, target: Optional[str] = None) -> List[MigrationRecord]:
        """Run pending migrations up to target version."""
        await self.initialize()
        pending = await self.get_pending()
        results: List[MigrationRecord] = []

        for migration in pending:
            if target and migration.version > target:
                break

            record = await self._apply_migration(migration)
            results.append(record)

            if record.status == MigrationStatus.FAILED:
                break

        return results

    async def _apply_migration(self, migration: Migration) -> MigrationRecord:
        """Apply a single migration."""
        logger.info("Applying migration: " + migration.version + " - " + migration.name)
        start = time.time()

        ctx = MigrationContext(self._connection)
        record = MigrationRecord(
            version=migration.version,
            name=migration.name,
            applied_at=time.time(),
            checksum=migration.checksum(),
        )

        try:
            await migration.up(ctx)
            record.execution_time_ms = (time.time() - start) * 1000
            record.status = MigrationStatus.APPLIED
            logger.info("Applied " + migration.version + " in " + str(round(record.execution_time_ms)) + "ms")

        except Exception as e:
            record.execution_time_ms = (time.time() - start) * 1000
            record.status = MigrationStatus.FAILED
            record.error = str(e)
            logger.error("Migration " + migration.version + " failed: " + str(e))

        await self._store.mark_applied(record)
        return record

    async def rollback(self, steps: int = 1) -> List[MigrationRecord]:
        """Rollback last N migrations."""
        await self.initialize()
        applied = await self._store.get_applied()
        applied = sorted(applied, key=lambda r: r.version, reverse=True)

        results: List[MigrationRecord] = []
        for i, record in enumerate(applied[:steps]):
            if record.version not in self._migrations:
                logger.warning("Migration not found for rollback: " + record.version)
                continue

            migration = self._migrations[record.version]
            rollback_record = await self._rollback_migration(migration, record)
            results.append(rollback_record)

            if rollback_record.status == MigrationStatus.FAILED:
                break

        return results

    async def _rollback_migration(
        self,
        migration: Migration,
        record: MigrationRecord,
    ) -> MigrationRecord:
        """Rollback a single migration."""
        logger.info("Rolling back: " + migration.version + " - " + migration.name)
        start = time.time()

        ctx = MigrationContext(self._connection)

        try:
            await migration.down(ctx)
            record.execution_time_ms = (time.time() - start) * 1000
            record.status = MigrationStatus.ROLLED_BACK
            await self._store.mark_rolled_back(migration.version)
            logger.info("Rolled back " + migration.version + " in " + str(round(record.execution_time_ms)) + "ms")

        except Exception as e:
            record.execution_time_ms = (time.time() - start) * 1000
            record.status = MigrationStatus.FAILED
            record.error = str(e)
            logger.error("Rollback " + migration.version + " failed: " + str(e))

        return record

    async def status(self) -> Dict[str, Any]:
        """Get migration status."""
        await self.initialize()
        applied = await self._store.get_applied()
        pending = await self.get_pending()

        return {
            "applied_count": len(applied),
            "pending_count": len(pending),
            "applied": [r.to_dict() for r in applied],
            "pending": [{"version": m.version, "name": m.name} for m in pending],
            "current_version": applied[-1].version if applied else None,
        }

    async def verify_checksums(self) -> List[str]:
        """Verify migration checksums haven't changed."""
        applied = await self._store.get_applied()
        mismatches: List[str] = []

        for record in applied:
            if record.version in self._migrations:
                migration = self._migrations[record.version]
                current_checksum = migration.checksum()
                if current_checksum != record.checksum:
                    mismatches.append(
                        record.version + ": stored=" + record.checksum +
                        " current=" + current_checksum
                    )

        return mismatches

    def get_migration(self, version: str) -> Optional[Migration]:
        """Get migration by version."""
        return self._migrations.get(version)

    @property
    def migrations(self) -> List[Migration]:
        """Get all registered migrations in order."""
        return [self._migrations[v] for v in sorted(self._migrations.keys())]


class Seeder:
    """Database seeder for test/development data.

    Usage:
        seeder = Seeder()

        @seeder.seed("users")
        async def seed_users(ctx):
            await ctx.execute("INSERT INTO users ...")

        await seeder.run()
    """

    def __init__(self, connection: Any = None):
        self._connection = connection
        self._seeders: Dict[str, Callable[[MigrationContext], Awaitable[None]]] = {}

    def seed(self, name: str) -> Callable:
        """Decorator to register a seeder."""
        def decorator(func: Callable[[MigrationContext], Awaitable[None]]) -> Callable:
            self._seeders[name] = func
            return func
        return decorator

    def register(
        self,
        name: str,
        func: Callable[[MigrationContext], Awaitable[None]],
    ) -> None:
        """Register a seeder function."""
        self._seeders[name] = func

    async def run(self, names: Optional[List[str]] = None) -> Dict[str, bool]:
        """Run seeders."""
        ctx = MigrationContext(self._connection)
        results: Dict[str, bool] = {}

        seeders_to_run = names or list(self._seeders.keys())

        for name in seeders_to_run:
            if name not in self._seeders:
                results[name] = False
                continue

            try:
                logger.info("Running seeder: " + name)
                await self._seeders[name](ctx)
                results[name] = True
                logger.info("Seeder " + name + " completed")

            except Exception as e:
                results[name] = False
                logger.error("Seeder " + name + " failed: " + str(e))

        return results

    @property
    def available(self) -> List[str]:
        """Get available seeder names."""
        return list(self._seeders.keys())
