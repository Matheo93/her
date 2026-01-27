"""
A/B Testing - Experimentation system for feature testing.

Provides tools for running A/B tests, feature experiments,
and analyzing statistical significance of results.
"""

from __future__ import annotations

import hashlib
import random
import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Callable, Generic, TypeVar
from threading import RLock


T = TypeVar("T")


class ExperimentStatus(Enum):
    """Status of an experiment."""

    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


class AllocationStrategy(Enum):
    """Strategy for allocating users to variants."""

    RANDOM = "random"
    DETERMINISTIC = "deterministic"
    WEIGHTED = "weighted"
    STICKY = "sticky"


class MetricType(Enum):
    """Type of metric being tracked."""

    CONVERSION = "conversion"
    COUNT = "count"
    DURATION = "duration"
    REVENUE = "revenue"
    RATIO = "ratio"


@dataclass
class Variant:
    """A variant in an A/B test."""

    id: str
    name: str
    weight: float = 0.5
    config: dict[str, Any] = field(default_factory=dict)
    is_control: bool = False
    description: str = ""

    def get_config(self, key: str, default: Any = None) -> Any:
        """Get a config value."""
        return self.config.get(key, default)


@dataclass
class MetricResult:
    """Result of a metric for a variant."""

    variant_id: str
    total: float = 0.0
    count: int = 0
    sum_squared: float = 0.0
    min_value: float = float("inf")
    max_value: float = float("-inf")

    @property
    def mean(self) -> float:
        """Calculate the mean."""
        return self.total / self.count if self.count > 0 else 0.0

    @property
    def variance(self) -> float:
        """Calculate the variance."""
        if self.count < 2:
            return 0.0
        mean = self.mean
        return (self.sum_squared - self.count * mean * mean) / (self.count - 1)

    @property
    def std_dev(self) -> float:
        """Calculate the standard deviation."""
        return math.sqrt(self.variance) if self.variance > 0 else 0.0

    @property
    def std_error(self) -> float:
        """Calculate the standard error."""
        return self.std_dev / math.sqrt(self.count) if self.count > 0 else 0.0

    def add_sample(self, value: float) -> None:
        """Add a sample to the metric."""
        self.total += value
        self.count += 1
        self.sum_squared += value * value
        self.min_value = min(self.min_value, value)
        self.max_value = max(self.max_value, value)


@dataclass
class Metric:
    """A metric being tracked in an experiment."""

    id: str
    name: str
    metric_type: MetricType
    description: str = ""
    is_primary: bool = False
    minimum_detectable_effect: float = 0.05

    def __post_init__(self):
        self.results: dict[str, MetricResult] = {}

    def record(self, variant_id: str, value: float = 1.0) -> None:
        """Record a value for a variant."""
        if variant_id not in self.results:
            self.results[variant_id] = MetricResult(variant_id=variant_id)
        self.results[variant_id].add_sample(value)

    def get_result(self, variant_id: str) -> MetricResult | None:
        """Get results for a variant."""
        return self.results.get(variant_id)

    def get_all_results(self) -> dict[str, MetricResult]:
        """Get all results."""
        return dict(self.results)


@dataclass
class Assignment:
    """Record of user assignment to a variant."""

    user_id: str
    experiment_id: str
    variant_id: str
    timestamp: datetime = field(default_factory=datetime.now)
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class StatisticalResult:
    """Result of statistical analysis."""

    control_mean: float
    treatment_mean: float
    relative_lift: float
    absolute_lift: float
    p_value: float
    confidence_interval: tuple[float, float]
    is_significant: bool
    sample_size_control: int
    sample_size_treatment: int
    power: float = 0.0


@dataclass
class Experiment:
    """An A/B test experiment."""

    id: str
    name: str
    description: str = ""
    variants: list[Variant] = field(default_factory=list)
    metrics: list[Metric] = field(default_factory=list)
    status: ExperimentStatus = ExperimentStatus.DRAFT
    allocation_strategy: AllocationStrategy = AllocationStrategy.DETERMINISTIC
    traffic_percentage: float = 100.0
    start_date: datetime | None = None
    end_date: datetime | None = None
    targeting_rules: list[Callable[[dict], bool]] = field(default_factory=list)
    metadata: dict[str, Any] = field(default_factory=dict)

    def __post_init__(self):
        self._assignments: dict[str, Assignment] = {}
        self._lock = RLock()

    def add_variant(self, variant: Variant) -> None:
        """Add a variant to the experiment."""
        self.variants.append(variant)

    def add_metric(self, metric: Metric) -> None:
        """Add a metric to the experiment."""
        self.metrics.append(metric)

    def get_variant(self, variant_id: str) -> Variant | None:
        """Get a variant by ID."""
        for v in self.variants:
            if v.id == variant_id:
                return v
        return None

    def get_control(self) -> Variant | None:
        """Get the control variant."""
        for v in self.variants:
            if v.is_control:
                return v
        return self.variants[0] if self.variants else None

    def get_metric(self, metric_id: str) -> Metric | None:
        """Get a metric by ID."""
        for m in self.metrics:
            if m.id == metric_id:
                return m
        return None

    def get_primary_metric(self) -> Metric | None:
        """Get the primary metric."""
        for m in self.metrics:
            if m.is_primary:
                return m
        return self.metrics[0] if self.metrics else None

    def is_user_eligible(self, user_context: dict[str, Any]) -> bool:
        """Check if user is eligible for the experiment."""
        if self.status != ExperimentStatus.RUNNING:
            return False

        for rule in self.targeting_rules:
            if not rule(user_context):
                return False

        return True

    def allocate(self, user_id: str, user_context: dict[str, Any] | None = None) -> Variant | None:
        """Allocate a user to a variant."""
        with self._lock:
            if user_id in self._assignments:
                return self.get_variant(self._assignments[user_id].variant_id)

            user_context = user_context or {}

            if not self.is_user_eligible(user_context):
                return None

            if random.random() * 100 > self.traffic_percentage:
                return None

            variant = self._select_variant(user_id)
            if variant:
                self._assignments[user_id] = Assignment(
                    user_id=user_id,
                    experiment_id=self.id,
                    variant_id=variant.id,
                    metadata=user_context
                )

            return variant

    def _select_variant(self, user_id: str) -> Variant | None:
        """Select a variant for a user."""
        if not self.variants:
            return None

        if self.allocation_strategy == AllocationStrategy.RANDOM:
            return self._random_allocation()

        if self.allocation_strategy == AllocationStrategy.DETERMINISTIC:
            return self._deterministic_allocation(user_id)

        if self.allocation_strategy == AllocationStrategy.WEIGHTED:
            return self._weighted_allocation()

        return self._deterministic_allocation(user_id)

    def _random_allocation(self) -> Variant:
        """Randomly allocate to a variant."""
        return random.choice(self.variants)

    def _deterministic_allocation(self, user_id: str) -> Variant:
        """Deterministically allocate based on user ID hash."""
        hash_input = f"{self.id}:{user_id}".encode()
        hash_value = int(hashlib.md5(hash_input).hexdigest(), 16)
        bucket = hash_value % 100

        cumulative = 0.0
        for variant in self.variants:
            cumulative += variant.weight * 100
            if bucket < cumulative:
                return variant

        return self.variants[-1]

    def _weighted_allocation(self) -> Variant:
        """Allocate based on variant weights."""
        total_weight = sum(v.weight for v in self.variants)
        r = random.random() * total_weight

        cumulative = 0.0
        for variant in self.variants:
            cumulative += variant.weight
            if r < cumulative:
                return variant

        return self.variants[-1]

    def record_event(self, user_id: str, metric_id: str, value: float = 1.0) -> bool:
        """Record an event for a user."""
        with self._lock:
            if user_id not in self._assignments:
                return False

            assignment = self._assignments[user_id]
            metric = self.get_metric(metric_id)

            if metric is None:
                return False

            metric.record(assignment.variant_id, value)
            return True

    def get_assignment(self, user_id: str) -> Assignment | None:
        """Get assignment for a user."""
        with self._lock:
            return self._assignments.get(user_id)

    def get_all_assignments(self) -> list[Assignment]:
        """Get all assignments."""
        with self._lock:
            return list(self._assignments.values())


class StatisticalAnalyzer:
    """Analyzer for experiment results."""

    @staticmethod
    def analyze_conversion(
        control: MetricResult,
        treatment: MetricResult,
        confidence_level: float = 0.95
    ) -> StatisticalResult:
        """Analyze conversion metric using chi-square test approximation."""
        p_control = control.mean
        p_treatment = treatment.mean
        n_control = control.count
        n_treatment = treatment.count

        if n_control == 0 or n_treatment == 0:
            return StatisticalResult(
                control_mean=p_control,
                treatment_mean=p_treatment,
                relative_lift=0.0,
                absolute_lift=0.0,
                p_value=1.0,
                confidence_interval=(0.0, 0.0),
                is_significant=False,
                sample_size_control=n_control,
                sample_size_treatment=n_treatment
            )

        pooled_p = (control.total + treatment.total) / (n_control + n_treatment)
        pooled_se = math.sqrt(pooled_p * (1 - pooled_p) * (1/n_control + 1/n_treatment))

        if pooled_se == 0:
            pooled_se = 0.0001

        z_score = (p_treatment - p_control) / pooled_se
        p_value = 2 * (1 - StatisticalAnalyzer._norm_cdf(abs(z_score)))

        z_critical = StatisticalAnalyzer._norm_ppf((1 + confidence_level) / 2)
        se_diff = math.sqrt(
            (p_control * (1 - p_control) / n_control) +
            (p_treatment * (1 - p_treatment) / n_treatment)
        )
        ci_lower = (p_treatment - p_control) - z_critical * se_diff
        ci_upper = (p_treatment - p_control) + z_critical * se_diff

        absolute_lift = p_treatment - p_control
        relative_lift = absolute_lift / p_control if p_control > 0 else 0.0

        is_significant = p_value < (1 - confidence_level)

        return StatisticalResult(
            control_mean=p_control,
            treatment_mean=p_treatment,
            relative_lift=relative_lift,
            absolute_lift=absolute_lift,
            p_value=p_value,
            confidence_interval=(ci_lower, ci_upper),
            is_significant=is_significant,
            sample_size_control=n_control,
            sample_size_treatment=n_treatment
        )

    @staticmethod
    def analyze_continuous(
        control: MetricResult,
        treatment: MetricResult,
        confidence_level: float = 0.95
    ) -> StatisticalResult:
        """Analyze continuous metric using t-test."""
        n_control = control.count
        n_treatment = treatment.count

        if n_control < 2 or n_treatment < 2:
            return StatisticalResult(
                control_mean=control.mean,
                treatment_mean=treatment.mean,
                relative_lift=0.0,
                absolute_lift=0.0,
                p_value=1.0,
                confidence_interval=(0.0, 0.0),
                is_significant=False,
                sample_size_control=n_control,
                sample_size_treatment=n_treatment
            )

        pooled_var = (
            ((n_control - 1) * control.variance + (n_treatment - 1) * treatment.variance) /
            (n_control + n_treatment - 2)
        )
        se = math.sqrt(pooled_var * (1/n_control + 1/n_treatment))

        if se == 0:
            se = 0.0001

        t_stat = (treatment.mean - control.mean) / se
        df = n_control + n_treatment - 2
        p_value = 2 * (1 - StatisticalAnalyzer._t_cdf(abs(t_stat), df))

        t_critical = StatisticalAnalyzer._t_ppf((1 + confidence_level) / 2, df)
        ci_lower = (treatment.mean - control.mean) - t_critical * se
        ci_upper = (treatment.mean - control.mean) + t_critical * se

        absolute_lift = treatment.mean - control.mean
        relative_lift = absolute_lift / control.mean if control.mean != 0 else 0.0

        is_significant = p_value < (1 - confidence_level)

        return StatisticalResult(
            control_mean=control.mean,
            treatment_mean=treatment.mean,
            relative_lift=relative_lift,
            absolute_lift=absolute_lift,
            p_value=p_value,
            confidence_interval=(ci_lower, ci_upper),
            is_significant=is_significant,
            sample_size_control=n_control,
            sample_size_treatment=n_treatment
        )

    @staticmethod
    def calculate_sample_size(
        baseline_rate: float,
        minimum_detectable_effect: float,
        power: float = 0.8,
        significance_level: float = 0.05
    ) -> int:
        """Calculate required sample size per variant."""
        p1 = baseline_rate
        p2 = baseline_rate * (1 + minimum_detectable_effect)

        pooled_p = (p1 + p2) / 2
        effect = abs(p2 - p1)

        z_alpha = StatisticalAnalyzer._norm_ppf(1 - significance_level / 2)
        z_beta = StatisticalAnalyzer._norm_ppf(power)

        n = (
            2 * pooled_p * (1 - pooled_p) * ((z_alpha + z_beta) ** 2) /
            (effect ** 2)
        )

        return int(math.ceil(n))

    @staticmethod
    def _norm_cdf(x: float) -> float:
        """Approximate normal CDF."""
        return (1.0 + math.erf(x / math.sqrt(2.0))) / 2.0

    @staticmethod
    def _norm_ppf(p: float) -> float:
        """Approximate normal PPF (inverse CDF)."""
        if p <= 0:
            return float("-inf")
        if p >= 1:
            return float("inf")

        a = [
            -3.969683028665376e+01,
            2.209460984245205e+02,
            -2.759285104469687e+02,
            1.383577518672690e+02,
            -3.066479806614716e+01,
            2.506628277459239e+00
        ]
        b = [
            -5.447609879822406e+01,
            1.615858368580409e+02,
            -1.556989798598866e+02,
            6.680131188771972e+01,
            -1.328068155288572e+01
        ]
        c = [
            -7.784894002430293e-03,
            -3.223964580411365e-01,
            -2.400758277161838e+00,
            -2.549732539343734e+00,
            4.374664141464968e+00,
            2.938163982698783e+00
        ]
        d = [
            7.784695709041462e-03,
            3.224671290700398e-01,
            2.445134137142996e+00,
            3.754408661907416e+00
        ]

        p_low = 0.02425
        p_high = 1 - p_low

        if p < p_low:
            q = math.sqrt(-2 * math.log(p))
            return (
                ((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]
            ) / (
                (((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1
            )
        elif p <= p_high:
            q = p - 0.5
            r = q * q
            return (
                ((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]
            ) * q / (
                ((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1
            )
        else:
            q = math.sqrt(-2 * math.log(1 - p))
            return -(
                ((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]
            ) / (
                (((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1
            )

    @staticmethod
    def _t_cdf(t: float, df: int) -> float:
        """Approximate t-distribution CDF using normal approximation for large df."""
        if df > 30:
            return StatisticalAnalyzer._norm_cdf(t)

        x = df / (df + t * t)
        return 1 - 0.5 * StatisticalAnalyzer._incomplete_beta(df / 2, 0.5, x)

    @staticmethod
    def _t_ppf(p: float, df: int) -> float:
        """Approximate t-distribution PPF using normal approximation."""
        if df > 30:
            return StatisticalAnalyzer._norm_ppf(p)

        z = StatisticalAnalyzer._norm_ppf(p)
        return z * math.sqrt(df / (df - 2)) if df > 2 else z

    @staticmethod
    def _incomplete_beta(a: float, b: float, x: float) -> float:
        """Approximate incomplete beta function."""
        if x == 0:
            return 0.0
        if x == 1:
            return 1.0

        bt = math.exp(
            math.lgamma(a + b) - math.lgamma(a) - math.lgamma(b) +
            a * math.log(x) + b * math.log(1 - x)
        )

        if x < (a + 1) / (a + b + 2):
            return bt * StatisticalAnalyzer._beta_cf(a, b, x) / a
        else:
            return 1 - bt * StatisticalAnalyzer._beta_cf(b, a, 1 - x) / b

    @staticmethod
    def _beta_cf(a: float, b: float, x: float) -> float:
        """Continued fraction for incomplete beta."""
        qab = a + b
        qap = a + 1
        qam = a - 1
        c = 1.0
        d = 1 - qab * x / qap
        if abs(d) < 1e-30:
            d = 1e-30
        d = 1 / d
        h = d

        for m in range(1, 101):
            m2 = 2 * m
            aa = m * (b - m) * x / ((qam + m2) * (a + m2))
            d = 1 + aa * d
            if abs(d) < 1e-30:
                d = 1e-30
            c = 1 + aa / c
            if abs(c) < 1e-30:
                c = 1e-30
            d = 1 / d
            h *= d * c

            aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2))
            d = 1 + aa * d
            if abs(d) < 1e-30:
                d = 1e-30
            c = 1 + aa / c
            if abs(c) < 1e-30:
                c = 1e-30
            d = 1 / d
            delta = d * c
            h *= delta
            if abs(delta - 1) < 1e-8:
                break

        return h


class ABTestingEngine:
    """Main engine for managing A/B tests."""

    def __init__(self):
        self._experiments: dict[str, Experiment] = {}
        self._lock = RLock()
        self._analyzer = StatisticalAnalyzer()

    def create_experiment(
        self,
        experiment_id: str,
        name: str,
        description: str = ""
    ) -> Experiment:
        """Create a new experiment."""
        with self._lock:
            if experiment_id in self._experiments:
                raise ValueError(f"Experiment {experiment_id} already exists")

            experiment = Experiment(
                id=experiment_id,
                name=name,
                description=description
            )
            self._experiments[experiment_id] = experiment
            return experiment

    def get_experiment(self, experiment_id: str) -> Experiment | None:
        """Get an experiment by ID."""
        with self._lock:
            return self._experiments.get(experiment_id)

    def delete_experiment(self, experiment_id: str) -> bool:
        """Delete an experiment."""
        with self._lock:
            if experiment_id in self._experiments:
                del self._experiments[experiment_id]
                return True
            return False

    def list_experiments(
        self,
        status: ExperimentStatus | None = None
    ) -> list[Experiment]:
        """List all experiments, optionally filtered by status."""
        with self._lock:
            experiments = list(self._experiments.values())
            if status:
                experiments = [e for e in experiments if e.status == status]
            return experiments

    def start_experiment(self, experiment_id: str) -> bool:
        """Start an experiment."""
        with self._lock:
            exp = self._experiments.get(experiment_id)
            if not exp:
                return False
            if exp.status != ExperimentStatus.DRAFT:
                return False
            exp.status = ExperimentStatus.RUNNING
            exp.start_date = datetime.now()
            return True

    def pause_experiment(self, experiment_id: str) -> bool:
        """Pause an experiment."""
        with self._lock:
            exp = self._experiments.get(experiment_id)
            if not exp:
                return False
            if exp.status != ExperimentStatus.RUNNING:
                return False
            exp.status = ExperimentStatus.PAUSED
            return True

    def resume_experiment(self, experiment_id: str) -> bool:
        """Resume a paused experiment."""
        with self._lock:
            exp = self._experiments.get(experiment_id)
            if not exp:
                return False
            if exp.status != ExperimentStatus.PAUSED:
                return False
            exp.status = ExperimentStatus.RUNNING
            return True

    def complete_experiment(self, experiment_id: str) -> bool:
        """Complete an experiment."""
        with self._lock:
            exp = self._experiments.get(experiment_id)
            if not exp:
                return False
            exp.status = ExperimentStatus.COMPLETED
            exp.end_date = datetime.now()
            return True

    def get_variant_for_user(
        self,
        experiment_id: str,
        user_id: str,
        user_context: dict[str, Any] | None = None
    ) -> Variant | None:
        """Get the variant assigned to a user."""
        exp = self.get_experiment(experiment_id)
        if not exp:
            return None
        return exp.allocate(user_id, user_context)

    def record_conversion(
        self,
        experiment_id: str,
        user_id: str,
        metric_id: str | None = None,
        value: float = 1.0
    ) -> bool:
        """Record a conversion event."""
        exp = self.get_experiment(experiment_id)
        if not exp:
            return False

        if metric_id is None:
            primary = exp.get_primary_metric()
            if not primary:
                return False
            metric_id = primary.id

        return exp.record_event(user_id, metric_id, value)

    def analyze_experiment(
        self,
        experiment_id: str,
        metric_id: str | None = None,
        confidence_level: float = 0.95
    ) -> dict[str, StatisticalResult] | None:
        """Analyze experiment results."""
        exp = self.get_experiment(experiment_id)
        if not exp:
            return None

        if metric_id is None:
            primary = exp.get_primary_metric()
            if not primary:
                return None
            metric_id = primary.id

        metric = exp.get_metric(metric_id)
        if not metric:
            return None

        control = exp.get_control()
        if not control:
            return None

        control_result = metric.get_result(control.id)
        if not control_result:
            return None

        results = {}
        for variant in exp.variants:
            if variant.is_control:
                continue

            treatment_result = metric.get_result(variant.id)
            if not treatment_result:
                continue

            if metric.metric_type == MetricType.CONVERSION:
                stat_result = self._analyzer.analyze_conversion(
                    control_result, treatment_result, confidence_level
                )
            else:
                stat_result = self._analyzer.analyze_continuous(
                    control_result, treatment_result, confidence_level
                )

            results[variant.id] = stat_result

        return results

    def get_experiment_summary(self, experiment_id: str) -> dict[str, Any] | None:
        """Get a summary of experiment results."""
        exp = self.get_experiment(experiment_id)
        if not exp:
            return None

        assignments = exp.get_all_assignments()
        variant_counts = {}
        for assignment in assignments:
            variant_counts[assignment.variant_id] = variant_counts.get(
                assignment.variant_id, 0
            ) + 1

        metrics_summary = {}
        for metric in exp.metrics:
            metric_data = {}
            for variant in exp.variants:
                result = metric.get_result(variant.id)
                if result:
                    metric_data[variant.id] = {
                        "count": result.count,
                        "mean": result.mean,
                        "std_dev": result.std_dev,
                        "min": result.min_value if result.min_value != float("inf") else None,
                        "max": result.max_value if result.max_value != float("-inf") else None,
                    }
            metrics_summary[metric.id] = metric_data

        return {
            "experiment_id": exp.id,
            "name": exp.name,
            "status": exp.status.value,
            "start_date": exp.start_date.isoformat() if exp.start_date else None,
            "end_date": exp.end_date.isoformat() if exp.end_date else None,
            "total_assignments": len(assignments),
            "variant_distribution": variant_counts,
            "metrics": metrics_summary,
        }


class ExperimentBuilder:
    """Fluent builder for creating experiments."""

    def __init__(self, experiment_id: str, name: str):
        self._id = experiment_id
        self._name = name
        self._description = ""
        self._variants: list[Variant] = []
        self._metrics: list[Metric] = []
        self._allocation_strategy = AllocationStrategy.DETERMINISTIC
        self._traffic_percentage = 100.0
        self._targeting_rules: list[Callable[[dict], bool]] = []

    def description(self, desc: str) -> ExperimentBuilder:
        """Set description."""
        self._description = desc
        return self

    def add_control(
        self,
        variant_id: str,
        name: str,
        weight: float = 0.5,
        config: dict[str, Any] | None = None
    ) -> ExperimentBuilder:
        """Add control variant."""
        self._variants.append(Variant(
            id=variant_id,
            name=name,
            weight=weight,
            config=config or {},
            is_control=True
        ))
        return self

    def add_treatment(
        self,
        variant_id: str,
        name: str,
        weight: float = 0.5,
        config: dict[str, Any] | None = None
    ) -> ExperimentBuilder:
        """Add treatment variant."""
        self._variants.append(Variant(
            id=variant_id,
            name=name,
            weight=weight,
            config=config or {},
            is_control=False
        ))
        return self

    def add_conversion_metric(
        self,
        metric_id: str,
        name: str,
        is_primary: bool = False
    ) -> ExperimentBuilder:
        """Add a conversion metric."""
        self._metrics.append(Metric(
            id=metric_id,
            name=name,
            metric_type=MetricType.CONVERSION,
            is_primary=is_primary
        ))
        return self

    def add_revenue_metric(
        self,
        metric_id: str,
        name: str,
        is_primary: bool = False
    ) -> ExperimentBuilder:
        """Add a revenue metric."""
        self._metrics.append(Metric(
            id=metric_id,
            name=name,
            metric_type=MetricType.REVENUE,
            is_primary=is_primary
        ))
        return self

    def allocation(self, strategy: AllocationStrategy) -> ExperimentBuilder:
        """Set allocation strategy."""
        self._allocation_strategy = strategy
        return self

    def traffic(self, percentage: float) -> ExperimentBuilder:
        """Set traffic percentage."""
        self._traffic_percentage = percentage
        return self

    def target(self, rule: Callable[[dict], bool]) -> ExperimentBuilder:
        """Add targeting rule."""
        self._targeting_rules.append(rule)
        return self

    def build(self) -> Experiment:
        """Build the experiment."""
        exp = Experiment(
            id=self._id,
            name=self._name,
            description=self._description,
            variants=self._variants,
            metrics=self._metrics,
            allocation_strategy=self._allocation_strategy,
            traffic_percentage=self._traffic_percentage,
            targeting_rules=self._targeting_rules
        )
        return exp


# Export all
__all__ = [
    "ExperimentStatus",
    "AllocationStrategy",
    "MetricType",
    "Variant",
    "MetricResult",
    "Metric",
    "Assignment",
    "StatisticalResult",
    "Experiment",
    "StatisticalAnalyzer",
    "ABTestingEngine",
    "ExperimentBuilder",
]
