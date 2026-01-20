"use client";

import { useRef, useMemo } from "react";
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
  isActive,
}: {
  memory: MemoryTrace;
  index: number;
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

// Ambient particle field - represents EVA's "presence"
function PresenceField({ isActive }: { isActive: boolean }) {
  const groupRef = useRef<THREE.Group>(null);
  const count = 30;

  // Create particle positions
  const particles = useMemo(() => {
    return Array.from({ length: count }, (_, i) => ({
      x: (Math.random() - 0.5) * 6,
      y: (Math.random() - 0.5) * 4,
      z: -2 - Math.random() * 3,
      phase: Math.random() * Math.PI * 2,
      speed: 0.3 + Math.random() * 0.4,
    }));
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;

    const time = state.clock.getElapsedTime();

    // Animate each child
    groupRef.current.children.forEach((child, i) => {
      if (child instanceof THREE.Mesh) {
        const p = particles[i];
        // Gentle floating movement
        child.position.y = p.y + Math.sin(time * p.speed + p.phase) * 0.2;
        child.position.x = p.x + Math.sin(time * p.speed * 0.7 + p.phase) * 0.1;

        // Fade based on activity
        const mat = child.material as THREE.MeshBasicMaterial;
        mat.opacity = isActive ? 0.25 : 0.1;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {particles.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, p.z]}>
          <sphereGeometry args={[0.015, 8, 8]} />
          <meshBasicMaterial
            color={HER_COLORS.coral}
            transparent
            opacity={0.15}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
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
          isActive={isActive}
        />
      ))}
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
