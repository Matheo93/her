"use client";

import { useRef, useEffect, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HER_COLORS } from "@/styles/her-theme";

// Memory trace represents a moment in conversation
interface MemoryTrace {
  id: string;
  timestamp: number;
  type: "user" | "eva";
  intensity: number; // 0-1, how significant this moment was
  emotion?: string;
}

interface MemoryParticlesProps {
  memories: MemoryTrace[];
  isActive: boolean; // When EVA is listening/speaking
  className?: string;
}

// Single memory particle - a floating orb representing a moment
function MemoryOrb({
  memory,
  index,
  total,
  isActive,
}: {
  memory: MemoryTrace;
  index: number;
  total: number;
  isActive: boolean;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const initialPos = useRef({
    x: (Math.random() - 0.5) * 3,
    y: (Math.random() - 0.5) * 2,
    z: -1 - Math.random() * 2,
  });
  const phase = useRef(Math.random() * Math.PI * 2);
  const orbitSpeed = useRef(0.1 + Math.random() * 0.2);

  // Age of memory affects opacity (older = more faded)
  const age = (Date.now() - memory.timestamp) / 1000; // seconds
  const ageFade = Math.max(0.2, 1 - age / 600); // Fade over 10 minutes

  // Color based on who spoke
  const color = useMemo(() => {
    if (memory.type === "eva") {
      return new THREE.Color(HER_COLORS.coral);
    }
    return new THREE.Color(HER_COLORS.earth);
  }, [memory.type]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const time = state.clock.getElapsedTime();

    // Gentle orbital movement - memories float around
    phase.current += delta * orbitSpeed.current;

    // Position with gentle drift
    const driftX = Math.sin(phase.current) * 0.5;
    const driftY = Math.sin(phase.current * 0.7 + index) * 0.3;
    const driftZ = Math.sin(phase.current * 0.5) * 0.2;

    meshRef.current.position.x = initialPos.current.x + driftX;
    meshRef.current.position.y = initialPos.current.y + driftY;
    meshRef.current.position.z = initialPos.current.z + driftZ;

    // Scale pulses subtly when conversation is active
    const basePulse = isActive ? 0.05 : 0.02;
    const pulse = 1 + Math.sin(time * 2 + index) * basePulse;
    meshRef.current.scale.setScalar(pulse * (0.02 + memory.intensity * 0.03));

    // Opacity based on age and activity
    const material = meshRef.current.material as THREE.MeshBasicMaterial;
    material.opacity = ageFade * (isActive ? 0.6 : 0.3);
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[1, 16, 16]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.3}
        depthWrite={false}
      />
    </mesh>
  );
}

// Connection lines between recent memories - shows conversation flow
function MemoryConnections({
  memories,
  isActive,
}: {
  memories: MemoryTrace[];
  isActive: boolean;
}) {
  const lineRef = useRef<THREE.Line>(null);

  // Only connect recent memories (last 5)
  const recentMemories = memories.slice(-5);

  useFrame(() => {
    if (!lineRef.current || recentMemories.length < 2) return;

    const material = lineRef.current.material as THREE.LineBasicMaterial;
    material.opacity = isActive ? 0.15 : 0.05;
  });

  if (recentMemories.length < 2) return null;

  // Create a curved path through memories
  const points = recentMemories.map((_, i) => {
    const angle = (i / recentMemories.length) * Math.PI * 2;
    return new THREE.Vector3(
      Math.sin(angle) * 1.5,
      Math.cos(angle) * 0.8,
      -2
    );
  });

  const curve = new THREE.CatmullRomCurve3(points, true);
  const curvePoints = curve.getPoints(50);
  const geometry = new THREE.BufferGeometry().setFromPoints(curvePoints);

  return (
    <line ref={lineRef} geometry={geometry}>
      <lineBasicMaterial
        color={HER_COLORS.softShadow}
        transparent
        opacity={0.1}
        depthWrite={false}
      />
    </line>
  );
}

// Ambient particle field - represents EVA's "presence"
function PresenceField({ isActive }: { isActive: boolean }) {
  const particlesRef = useRef<THREE.Points>(null);
  const count = 50;

  const positions = useMemo(() => {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 4;
      pos[i * 3 + 2] = -2 - Math.random() * 3;
    }
    return pos;
  }, []);

  useFrame((state) => {
    if (!particlesRef.current) return;

    const time = state.clock.getElapsedTime();
    const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;

    // Gentle floating movement
    for (let i = 0; i < count; i++) {
      const idx = i * 3;
      positions[idx + 1] += Math.sin(time * 0.5 + i) * 0.001;
    }
    particlesRef.current.geometry.attributes.position.needsUpdate = true;

    // Opacity based on activity
    const material = particlesRef.current.material as THREE.PointsMaterial;
    material.opacity = isActive ? 0.4 : 0.15;
  });

  return (
    <points ref={particlesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={count}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.02}
        color={HER_COLORS.coral}
        transparent
        opacity={0.2}
        depthWrite={false}
        sizeAttenuation
      />
    </points>
  );
}

// Main canvas component
function MemoryScene({
  memories,
  isActive,
}: {
  memories: MemoryTrace[];
  isActive: boolean;
}) {
  return (
    <>
      {/* Ambient presence particles */}
      <PresenceField isActive={isActive} />

      {/* Memory orbs */}
      {memories.slice(-10).map((memory, index) => (
        <MemoryOrb
          key={memory.id}
          memory={memory}
          index={index}
          total={memories.length}
          isActive={isActive}
        />
      ))}

      {/* Connection lines */}
      <MemoryConnections memories={memories} isActive={isActive} />
    </>
  );
}

export function MemoryParticles({
  memories,
  isActive,
  className = "",
}: MemoryParticlesProps) {
  return (
    <div
      className={`absolute inset-0 pointer-events-none ${className}`}
      style={{ zIndex: 0 }}
    >
      <Canvas
        camera={{ position: [0, 0, 2], fov: 60 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        <MemoryScene memories={memories} isActive={isActive} />
      </Canvas>
    </div>
  );
}

export type { MemoryTrace };
export default MemoryParticles;
