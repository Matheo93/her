"use client";

import { useRef, useEffect, useMemo, useState, useCallback } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { HER_COLORS } from "@/styles/her-theme";

// Viseme weights type
export interface VisemeWeights {
  sil?: number;
  PP?: number;
  FF?: number;
  TH?: number;
  DD?: number;
  kk?: number;
  CH?: number;
  SS?: number;
  RR?: number;
  AA?: number;
  EE?: number;
  OO?: number;
}

interface AvatarProps {
  visemeWeights: VisemeWeights;
  emotion: string;
  isSpeaking: boolean;
  isListening: boolean;
  audioLevel: number;
}

// Map visemes to mouth shape parameters
const VISEME_MOUTH_PARAMS: Record<string, { jawOpen: number; mouthWide: number; lipRound: number }> = {
  sil: { jawOpen: 0, mouthWide: 0, lipRound: 0 },
  PP: { jawOpen: 0.05, mouthWide: -0.1, lipRound: 0 },
  FF: { jawOpen: 0.1, mouthWide: 0.1, lipRound: 0 },
  TH: { jawOpen: 0.15, mouthWide: 0.05, lipRound: 0 },
  DD: { jawOpen: 0.2, mouthWide: 0, lipRound: 0 },
  kk: { jawOpen: 0.25, mouthWide: -0.05, lipRound: 0 },
  CH: { jawOpen: 0.15, mouthWide: 0.2, lipRound: 0.3 },
  SS: { jawOpen: 0.1, mouthWide: 0.25, lipRound: 0 },
  RR: { jawOpen: 0.2, mouthWide: 0, lipRound: 0.2 },
  AA: { jawOpen: 0.7, mouthWide: 0.2, lipRound: 0 },
  EE: { jawOpen: 0.3, mouthWide: 0.4, lipRound: 0 },
  OO: { jawOpen: 0.5, mouthWide: -0.2, lipRound: 0.5 },
};

// Emotion to expression mapping with enhanced parameters
const EMOTION_EXPRESSIONS: Record<string, {
  eyebrowRaise: number;
  eyeSquint: number;
  smileAmount: number;
  headTilt: number;
  pupilDilation: number; // 0 = normal, positive = dilated (interest/attraction)
  cheekRaise: number; // For genuine smiles (Duchenne)
  noseScrunch: number; // For disgust or intense joy
}> = {
  neutral: { eyebrowRaise: 0, eyeSquint: 0, smileAmount: 0.1, headTilt: 0, pupilDilation: 0, cheekRaise: 0, noseScrunch: 0 },
  joy: { eyebrowRaise: 0.3, eyeSquint: 0.2, smileAmount: 0.6, headTilt: 0.05, pupilDilation: 0.2, cheekRaise: 0.4, noseScrunch: 0.1 },
  sadness: { eyebrowRaise: -0.2, eyeSquint: 0, smileAmount: -0.2, headTilt: -0.1, pupilDilation: -0.1, cheekRaise: 0, noseScrunch: 0 },
  tenderness: { eyebrowRaise: 0.1, eyeSquint: 0.15, smileAmount: 0.3, headTilt: 0.08, pupilDilation: 0.3, cheekRaise: 0.2, noseScrunch: 0 },
  excitement: { eyebrowRaise: 0.4, eyeSquint: 0, smileAmount: 0.5, headTilt: 0, pupilDilation: 0.4, cheekRaise: 0.3, noseScrunch: 0 },
  curiosity: { eyebrowRaise: 0.35, eyeSquint: 0, smileAmount: 0.15, headTilt: 0.15, pupilDilation: 0.25, cheekRaise: 0, noseScrunch: 0 },
  listening: { eyebrowRaise: 0.15, eyeSquint: 0, smileAmount: 0.1, headTilt: 0.05, pupilDilation: 0.15, cheekRaise: 0.1, noseScrunch: 0 },
  empathy: { eyebrowRaise: 0.05, eyeSquint: 0.1, smileAmount: 0.2, headTilt: 0.1, pupilDilation: 0.2, cheekRaise: 0.15, noseScrunch: 0 },
  thinking: { eyebrowRaise: 0.1, eyeSquint: 0.05, smileAmount: 0, headTilt: 0.05, pupilDilation: 0, cheekRaise: 0, noseScrunch: 0 },
  playful: { eyebrowRaise: 0.2, eyeSquint: 0.15, smileAmount: 0.45, headTilt: 0.12, pupilDilation: 0.25, cheekRaise: 0.35, noseScrunch: 0.05 },
};

// Human skin shader for realistic appearance
const skinVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    vViewPosition = -mvPosition.xyz;
    vUv = uv;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const skinFragmentShader = `
  uniform vec3 skinColor;
  uniform vec3 subsurfaceColor;
  uniform float subsurfaceIntensity;
  uniform float roughness;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec2 vUv;

  void main() {
    vec3 normal = normalize(vNormal);
    vec3 viewDir = normalize(vViewPosition);

    // Basic lighting
    vec3 lightDir = normalize(vec3(0.5, 1.0, 0.8));
    float NdotL = max(dot(normal, lightDir), 0.0);

    // Subsurface scattering approximation
    float sss = pow(max(0.0, dot(viewDir, -lightDir + normal * 0.5)), 2.0);
    vec3 subsurface = subsurfaceColor * sss * subsurfaceIntensity;

    // Fresnel for skin rim
    float fresnel = pow(1.0 - max(dot(normal, viewDir), 0.0), 3.0);
    vec3 rimLight = vec3(1.0, 0.95, 0.9) * fresnel * 0.3;

    // Combine
    vec3 diffuse = skinColor * (0.3 + NdotL * 0.7);
    vec3 finalColor = diffuse + subsurface + rimLight;

    // Slight color variation based on UV (more red on cheeks)
    float cheekBlush = smoothstep(0.3, 0.5, 1.0 - abs(vUv.x - 0.5) * 2.0) *
                       smoothstep(0.4, 0.6, vUv.y) * 0.1;
    finalColor += vec3(cheekBlush, 0.0, 0.0);

    gl_FragColor = vec4(finalColor, 1.0);
  }
`;

// Realistic 3D Head with all features
function RealisticHead({
  visemeWeights,
  emotion,
  isSpeaking,
  isListening,
  audioLevel
}: AvatarProps) {
  const headRef = useRef<THREE.Group>(null);
  const leftEyeRef = useRef<THREE.Group>(null);
  const rightEyeRef = useRef<THREE.Group>(null);
  const mouthRef = useRef<THREE.Mesh>(null);
  const jawRef = useRef<THREE.Group>(null);
  const leftEyebrowRef = useRef<THREE.Mesh>(null);
  const rightEyebrowRef = useRef<THREE.Mesh>(null);
  const leftLidRef = useRef<THREE.Mesh>(null);
  const rightLidRef = useRef<THREE.Mesh>(null);
  const leftPupilRef = useRef<THREE.Mesh>(null);
  const rightPupilRef = useRef<THREE.Mesh>(null);
  const leftCheekRef = useRef<THREE.Mesh>(null);
  const rightCheekRef = useRef<THREE.Mesh>(null);
  const noseRef = useRef<THREE.Mesh>(null);

  // Animation state
  const [blinkState, setBlinkState] = useState(0);
  const breathPhase = useRef(0);
  const microMovementPhase = useRef(0);
  const eyeSaccadeTarget = useRef({ x: 0, y: 0 });
  const eyeSaccadeTimer = useRef(0);
  const lastBlinkTime = useRef(0);
  const microExpressionPhase = useRef(0);
  const doubleBlinkChance = useRef(false);

  // Smoothed values for natural transitions
  const smoothedMouth = useRef({ jawOpen: 0, mouthWide: 0, lipRound: 0 });
  const smoothedExpression = useRef({
    eyebrowRaise: 0,
    eyeSquint: 0,
    smileAmount: 0.1,
    headTilt: 0,
    pupilDilation: 0,
    cheekRaise: 0,
    noseScrunch: 0,
  });

  // Calculate target mouth shape from viseme weights
  const targetMouthShape = useMemo(() => {
    let jawOpen = 0;
    let mouthWide = 0;
    let lipRound = 0;

    Object.entries(visemeWeights).forEach(([viseme, weight]) => {
      const params = VISEME_MOUTH_PARAMS[viseme];
      if (params && weight) {
        jawOpen += params.jawOpen * weight;
        mouthWide += params.mouthWide * weight;
        lipRound += params.lipRound * weight;
      }
    });

    // Add audio level for extra mouth movement when speaking
    if (isSpeaking) {
      jawOpen = Math.max(jawOpen, audioLevel * 0.5);
    }

    return { jawOpen, mouthWide, lipRound };
  }, [visemeWeights, isSpeaking, audioLevel]);

  // Get target expression from emotion
  const targetExpression = useMemo(() => {
    const expr = EMOTION_EXPRESSIONS[emotion] || EMOTION_EXPRESSIONS.neutral;
    if (isListening) {
      return { ...expr, ...EMOTION_EXPRESSIONS.listening };
    }
    return expr;
  }, [emotion, isListening]);

  // Skin material with subsurface scattering
  const skinMaterial = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: skinVertexShader,
      fragmentShader: skinFragmentShader,
      uniforms: {
        skinColor: { value: new THREE.Color("#E8B4A0") }, // Warm skin tone
        subsurfaceColor: { value: new THREE.Color("#FF8866") }, // Warm SSS
        subsurfaceIntensity: { value: 0.4 },
        roughness: { value: 0.6 },
      },
    });
  }, []);

  // Eye material
  const eyeMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: "#4A3728", // Warm brown eyes
      roughness: 0.1,
      metalness: 0.1,
    });
  }, []);

  // Lip material
  const lipMaterial = useMemo(() => {
    return new THREE.MeshStandardMaterial({
      color: HER_COLORS.coral,
      roughness: 0.4,
      metalness: 0,
    });
  }, []);

  // Main animation loop
  useFrame((state, delta) => {
    if (!headRef.current) return;

    const time = state.clock.getElapsedTime();

    // === BREATHING ===
    breathPhase.current += delta * 0.8; // ~4 second cycle
    const breathAmount = Math.sin(breathPhase.current) * 0.005;
    headRef.current.position.y = breathAmount;
    headRef.current.scale.setScalar(1 + breathAmount * 0.5);

    // === MICRO MOVEMENTS ===
    microMovementPhase.current += delta;

    // Subtle head sway (very gentle, like a real person)
    const headSwayX = Math.sin(microMovementPhase.current * 0.3) * 0.01;
    const headSwayY = Math.sin(microMovementPhase.current * 0.5) * 0.008;
    const headSwayZ = Math.sin(microMovementPhase.current * 0.4) * 0.005;

    headRef.current.rotation.x = headSwayX + smoothedExpression.current.headTilt;
    headRef.current.rotation.y = headSwayY;
    headRef.current.rotation.z = headSwayZ;

    // === EYE MICRO-SACCADES ===
    eyeSaccadeTimer.current -= delta;
    if (eyeSaccadeTimer.current <= 0) {
      // New saccade target
      eyeSaccadeTarget.current = {
        x: (Math.random() - 0.5) * 0.1,
        y: (Math.random() - 0.5) * 0.05,
      };
      eyeSaccadeTimer.current = 0.15 + Math.random() * 0.3;
    }

    // Apply eye movement
    if (leftEyeRef.current && rightEyeRef.current) {
      const targetX = eyeSaccadeTarget.current.x;
      const targetY = eyeSaccadeTarget.current.y;

      leftEyeRef.current.rotation.x = THREE.MathUtils.lerp(
        leftEyeRef.current.rotation.x,
        targetY,
        delta * 8
      );
      leftEyeRef.current.rotation.y = THREE.MathUtils.lerp(
        leftEyeRef.current.rotation.y,
        targetX,
        delta * 8
      );
      rightEyeRef.current.rotation.x = leftEyeRef.current.rotation.x;
      rightEyeRef.current.rotation.y = leftEyeRef.current.rotation.y;
    }

    // === NATURAL BLINKING WITH VARIATION ===
    const timeSinceLastBlink = time - lastBlinkTime.current;
    // Blink interval varies: faster when listening/excited, slower when calm
    const emotionBlinkMod = isListening ? 0.7 : (emotion === "excitement" ? 0.6 : 1);
    const blinkInterval = (2.5 + Math.random() * 3) * emotionBlinkMod;

    if (timeSinceLastBlink > blinkInterval && blinkState === 0) {
      setBlinkState(1);
      lastBlinkTime.current = time;
      // 20% chance for double blink (very human)
      doubleBlinkChance.current = Math.random() < 0.2;
    }

    // Animate eyelids for blink with asymmetry
    if (leftLidRef.current && rightLidRef.current) {
      let lidClose = 0;
      if (blinkState === 1) {
        lidClose = Math.min(1, blinkState + delta * 18); // Faster close
        if (lidClose >= 1) setBlinkState(2);
      } else if (blinkState === 2) {
        lidClose = Math.max(0, 1 - delta * 12); // Slightly slower open
        if (lidClose <= 0) {
          if (doubleBlinkChance.current) {
            doubleBlinkChance.current = false;
            setBlinkState(1); // Trigger second blink
          } else {
            setBlinkState(0);
          }
        }
      }

      // Add squint from expression
      lidClose = Math.max(lidClose, smoothedExpression.current.eyeSquint);

      // Slight asymmetry makes it more human (right lid slightly faster)
      leftLidRef.current.scale.y = 0.1 + lidClose * 0.9;
      rightLidRef.current.scale.y = 0.1 + Math.min(1, lidClose * 1.05) * 0.9;
    }

    // === MICRO-EXPRESSIONS (subtle, fleeting) ===
    microExpressionPhase.current += delta;

    // Tiny random eyebrow micro-movements (barely perceptible but adds life)
    const microBrow = Math.sin(microExpressionPhase.current * 2.1) * 0.01;

    // Subtle nostril flare when breathing in
    const nostrilFlare = Math.sin(breathPhase.current) > 0.7 ? 0.02 : 0;

    // === SMOOTH MOUTH TRANSITIONS ===
    const mouthLerpSpeed = isSpeaking ? 15 : 5;
    smoothedMouth.current.jawOpen = THREE.MathUtils.lerp(
      smoothedMouth.current.jawOpen,
      targetMouthShape.jawOpen,
      delta * mouthLerpSpeed
    );
    smoothedMouth.current.mouthWide = THREE.MathUtils.lerp(
      smoothedMouth.current.mouthWide,
      targetMouthShape.mouthWide,
      delta * mouthLerpSpeed
    );
    smoothedMouth.current.lipRound = THREE.MathUtils.lerp(
      smoothedMouth.current.lipRound,
      targetMouthShape.lipRound,
      delta * mouthLerpSpeed
    );

    // Apply mouth shape to jaw
    if (jawRef.current) {
      jawRef.current.rotation.x = -smoothedMouth.current.jawOpen * 0.3;
    }

    // Apply mouth shape to lips
    if (mouthRef.current) {
      // Scale for width and roundness
      const widthScale = 1 + smoothedMouth.current.mouthWide * 0.3;
      const roundScale = 1 - smoothedMouth.current.lipRound * 0.2;
      mouthRef.current.scale.x = widthScale * roundScale;
      mouthRef.current.scale.y = 1 + smoothedMouth.current.jawOpen * 0.5;
    }

    // === SMOOTH EXPRESSION TRANSITIONS ===
    const exprLerpSpeed = 3;
    smoothedExpression.current.eyebrowRaise = THREE.MathUtils.lerp(
      smoothedExpression.current.eyebrowRaise,
      targetExpression.eyebrowRaise,
      delta * exprLerpSpeed
    );
    smoothedExpression.current.eyeSquint = THREE.MathUtils.lerp(
      smoothedExpression.current.eyeSquint,
      targetExpression.eyeSquint,
      delta * exprLerpSpeed
    );
    smoothedExpression.current.smileAmount = THREE.MathUtils.lerp(
      smoothedExpression.current.smileAmount,
      targetExpression.smileAmount,
      delta * exprLerpSpeed
    );
    smoothedExpression.current.headTilt = THREE.MathUtils.lerp(
      smoothedExpression.current.headTilt,
      targetExpression.headTilt,
      delta * exprLerpSpeed
    );

    // Apply eyebrow positions
    if (leftEyebrowRef.current && rightEyebrowRef.current) {
      const browOffset = smoothedExpression.current.eyebrowRaise * 0.05;
      leftEyebrowRef.current.position.y = 0.35 + browOffset;
      rightEyebrowRef.current.position.y = 0.35 + browOffset;

      // Inner brow raise for concern
      if (emotion === "sadness") {
        leftEyebrowRef.current.rotation.z = 0.1;
        rightEyebrowRef.current.rotation.z = -0.1;
      } else {
        leftEyebrowRef.current.rotation.z = 0;
        rightEyebrowRef.current.rotation.z = 0;
      }
    }
  });

  return (
    <group ref={headRef}>
      {/* Head base - ellipsoid */}
      <mesh material={skinMaterial}>
        <sphereGeometry args={[0.5, 64, 64]} />
      </mesh>

      {/* Face front - slightly flattened */}
      <mesh position={[0, 0, 0.1]} material={skinMaterial}>
        <sphereGeometry args={[0.48, 64, 64]} />
      </mesh>

      {/* Nose */}
      <mesh position={[0, -0.05, 0.45]} material={skinMaterial}>
        <coneGeometry args={[0.06, 0.12, 16]} />
      </mesh>
      <mesh position={[0, -0.1, 0.48]} material={skinMaterial}>
        <sphereGeometry args={[0.04, 16, 16]} />
      </mesh>

      {/* Left eye socket */}
      <group ref={leftEyeRef} position={[-0.15, 0.1, 0.35]}>
        {/* Eyeball */}
        <mesh>
          <sphereGeometry args={[0.06, 32, 32]} />
          <meshStandardMaterial color="#FFFEF8" roughness={0.1} />
        </mesh>
        {/* Iris */}
        <mesh position={[0, 0, 0.045]}>
          <circleGeometry args={[0.035, 32]} />
          <meshStandardMaterial color="#4A3728" roughness={0.3} />
        </mesh>
        {/* Pupil */}
        <mesh position={[0, 0, 0.05]}>
          <circleGeometry args={[0.015, 32]} />
          <meshBasicMaterial color="#1A1A1A" />
        </mesh>
        {/* Eye highlight */}
        <mesh position={[0.015, 0.015, 0.055]}>
          <circleGeometry args={[0.008, 16]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
      </group>

      {/* Right eye socket */}
      <group ref={rightEyeRef} position={[0.15, 0.1, 0.35]}>
        <mesh>
          <sphereGeometry args={[0.06, 32, 32]} />
          <meshStandardMaterial color="#FFFEF8" roughness={0.1} />
        </mesh>
        <mesh position={[0, 0, 0.045]}>
          <circleGeometry args={[0.035, 32]} />
          <meshStandardMaterial color="#4A3728" roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.05]}>
          <circleGeometry args={[0.015, 32]} />
          <meshBasicMaterial color="#1A1A1A" />
        </mesh>
        <mesh position={[0.015, 0.015, 0.055]}>
          <circleGeometry args={[0.008, 16]} />
          <meshBasicMaterial color="#FFFFFF" />
        </mesh>
      </group>

      {/* Left eyelid */}
      <mesh ref={leftLidRef} position={[-0.15, 0.16, 0.38]}>
        <boxGeometry args={[0.14, 0.02, 0.04]} />
        <meshStandardMaterial color="#E8B4A0" />
      </mesh>

      {/* Right eyelid */}
      <mesh ref={rightLidRef} position={[0.15, 0.16, 0.38]}>
        <boxGeometry args={[0.14, 0.02, 0.04]} />
        <meshStandardMaterial color="#E8B4A0" />
      </mesh>

      {/* Left eyebrow */}
      <mesh ref={leftEyebrowRef} position={[-0.15, 0.22, 0.4]}>
        <capsuleGeometry args={[0.015, 0.1, 4, 8]} />
        <meshStandardMaterial color="#6B4423" />
      </mesh>

      {/* Right eyebrow */}
      <mesh ref={rightEyebrowRef} position={[0.15, 0.22, 0.4]} rotation={[0, 0, 0]}>
        <capsuleGeometry args={[0.015, 0.1, 4, 8]} />
        <meshStandardMaterial color="#6B4423" />
      </mesh>

      {/* Jaw/Lower face */}
      <group ref={jawRef}>
        {/* Lower lip */}
        <mesh ref={mouthRef} position={[0, -0.22, 0.42]} material={lipMaterial}>
          <torusGeometry args={[0.06, 0.02, 16, 32, Math.PI]} />
        </mesh>

        {/* Upper lip */}
        <mesh position={[0, -0.18, 0.42]} material={lipMaterial} rotation={[Math.PI, 0, 0]}>
          <torusGeometry args={[0.055, 0.015, 16, 32, Math.PI]} />
        </mesh>

        {/* Inside mouth (dark) */}
        <mesh position={[0, -0.2, 0.38]}>
          <sphereGeometry args={[0.04, 16, 16]} />
          <meshBasicMaterial color="#3A1A1A" />
        </mesh>

        {/* Chin */}
        <mesh position={[0, -0.35, 0.3]} material={skinMaterial}>
          <sphereGeometry args={[0.15, 32, 32]} />
        </mesh>
      </group>

      {/* Cheeks with subtle blush */}
      <mesh position={[-0.25, -0.05, 0.35]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial
          color="#F0A090"
          transparent
          opacity={0.3}
        />
      </mesh>
      <mesh position={[0.25, -0.05, 0.35]}>
        <sphereGeometry args={[0.12, 16, 16]} />
        <meshStandardMaterial
          color="#F0A090"
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Ears */}
      <mesh position={[-0.48, 0, 0]} rotation={[0, -0.3, 0]} material={skinMaterial}>
        <capsuleGeometry args={[0.05, 0.1, 4, 8]} />
      </mesh>
      <mesh position={[0.48, 0, 0]} rotation={[0, 0.3, 0]} material={skinMaterial}>
        <capsuleGeometry args={[0.05, 0.1, 4, 8]} />
      </mesh>

      {/* Hair (simple for now) */}
      <mesh position={[0, 0.35, -0.05]}>
        <sphereGeometry args={[0.45, 32, 32, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#3D2314" roughness={0.8} />
      </mesh>
      {/* Hair sides */}
      <mesh position={[-0.35, 0.1, -0.1]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#3D2314" roughness={0.8} />
      </mesh>
      <mesh position={[0.35, 0.1, -0.1]}>
        <sphereGeometry args={[0.2, 16, 16]} />
        <meshStandardMaterial color="#3D2314" roughness={0.8} />
      </mesh>
    </group>
  );
}

// Main component with Canvas setup
interface RealisticAvatar3DProps {
  visemeWeights?: VisemeWeights;
  emotion?: string;
  isSpeaking?: boolean;
  isListening?: boolean;
  audioLevel?: number;
  className?: string;
}

export function RealisticAvatar3D({
  visemeWeights = { sil: 1 },
  emotion = "neutral",
  isSpeaking = false,
  isListening = false,
  audioLevel = 0,
  className = "",
}: RealisticAvatar3DProps) {
  return (
    <div className={`relative ${className}`} style={{ width: "100%", height: "100%" }}>
      {/* Warm ambient glow behind avatar */}
      <div
        className="absolute inset-0 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, ${HER_COLORS.coral}40 0%, transparent 70%)`,
          opacity: isSpeaking ? 0.8 : isListening ? 0.6 : 0.4,
          transition: "opacity 0.3s ease-out",
        }}
      />

      <Canvas
        camera={{ position: [0, 0, 1.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
        style={{ background: "transparent" }}
      >
        {/* Warm lighting setup */}
        <ambientLight intensity={0.4} color="#FFF5E6" />
        <directionalLight
          position={[2, 3, 2]}
          intensity={0.8}
          color="#FFF8F0"
        />
        <directionalLight
          position={[-2, 1, 1]}
          intensity={0.3}
          color="#FFE0D0"
        />
        {/* Rim light for definition */}
        <pointLight
          position={[0, 0, -2]}
          intensity={0.2}
          color="#E8846B"
        />

        <RealisticHead
          visemeWeights={visemeWeights}
          emotion={emotion}
          isSpeaking={isSpeaking}
          isListening={isListening}
          audioLevel={audioLevel}
        />
      </Canvas>

      {/* Listening indicator ring - organic animation via framer-motion inline */}
      {isListening && (
        <div
          className="absolute inset-0 rounded-full border-2"
          style={{
            borderColor: HER_COLORS.coral,
            opacity: 0.5,
            animation: "breathe 2s ease-in-out infinite",
          }}
        />
      )}
      <style jsx>{`
        @keyframes breathe {
          0%, 100% { transform: scale(1); opacity: 0.4; }
          50% { transform: scale(1.02); opacity: 0.6; }
        }
      `}</style>
    </div>
  );
}

export default RealisticAvatar3D;
