"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

interface Props {
  isDark?: boolean;
}

export default function ThreeBackground({ isDark = true }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!mountRef.current) return;
    const container = mountRef.current;

    // ── Responsive particle count ──
    const isMobile = window.innerWidth < 768;
    const particleCount = isMobile ? 12000 : 22000;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(
      75,
      container.clientWidth / container.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 5;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    container.appendChild(renderer.domElement);

    const mouse = new THREE.Vector2(0, 0);
    const clock = new THREE.Clock();

    // ── Velocity-based particle system ──
    const positions = new Float32Array(particleCount * 3);
    const originalPositions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);

    const torusKnot = new THREE.TorusKnotGeometry(1.5, 0.5, 200, 32);
    const torusPos = torusKnot.attributes.position;
    const vertexCount = torusPos.count;

    const colorPalette = [
      new THREE.Color("#1B2B6B"),
      new THREE.Color("#2563EB"),
      new THREE.Color("#3B82F6"),
      new THREE.Color("#E87722"),
      new THREE.Color("#162C6D"),
    ];

    for (let i = 0; i < particleCount; i++) {
      const vi = i % vertexCount;
      const x = torusPos.getX(vi);
      const y = torusPos.getY(vi);
      const z = torusPos.getZ(vi);

      // Add slight random offset for organic feel
      const jitter = 0.03;
      positions[i * 3] = x + (Math.random() - 0.5) * jitter;
      positions[i * 3 + 1] = y + (Math.random() - 0.5) * jitter;
      positions[i * 3 + 2] = z + (Math.random() - 0.5) * jitter;
      originalPositions[i * 3] = positions[i * 3];
      originalPositions[i * 3 + 1] = positions[i * 3 + 1];
      originalPositions[i * 3 + 2] = positions[i * 3 + 2];

      const color = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;

      velocities[i * 3] = 0;
      velocities[i * 3 + 1] = 0;
      velocities[i * 3 + 2] = 0;
    }

    torusKnot.dispose();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: isMobile ? 0.025 : 0.02,
      vertexColors: true,
      blending: isDark ? THREE.AdditiveBlending : THREE.NormalBlending,
      transparent: true,
      opacity: isDark ? 0.8 : 0.6,
    });

    const points = new THREE.Points(geometry, material);
    scene.add(points);

    // ── Mouse tracking ──
    let targetMouseX = 0, targetMouseY = 0;
    const handleMouseMove = (e: MouseEvent) => {
      targetMouseX = (e.clientX / window.innerWidth) * 2 - 1;
      targetMouseY = -(e.clientY / window.innerHeight) * 2 + 1;
    };
    window.addEventListener("mousemove", handleMouseMove, { passive: true });

    // ── Touch support ──
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        targetMouseX = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
        targetMouseY = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
      }
    };
    window.addEventListener("touchmove", handleTouchMove, { passive: true });

    let frameId: number;

    const animate = () => {
      frameId = requestAnimationFrame(animate);
      const elapsed = clock.getElapsedTime();

      // Smooth mouse interpolation
      mouse.x += (targetMouseX - mouse.x) * 0.08;
      mouse.y += (targetMouseY - mouse.y) * 0.08;

      const mwx = mouse.x * 3;
      const mwy = mouse.y * 3;

      // Physics loop with batch processing
      for (let i = 0; i < particleCount; i++) {
        const ix = i * 3;
        const iy = ix + 1;
        const iz = ix + 2;

        const px = positions[ix];
        const py = positions[iy];
        const pz = positions[iz];

        let vx = velocities[ix];
        let vy = velocities[iy];
        let vz = velocities[iz];

        // Mouse repulsion force
        const dx = px - mwx;
        const dy = py - mwy;
        const distSq = dx * dx + dy * dy + pz * pz;
        if (distSq < 2.5 && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const force = (1.6 - dist) * 0.012;
          const invDist = 1 / dist;
          vx += dx * invDist * force;
          vy += dy * invDist * force;
          vz += pz * invDist * force;
        }

        // Gentle return to original
        vx += (originalPositions[ix] - px) * 0.0012;
        vy += (originalPositions[iy] - py) * 0.0012;
        vz += (originalPositions[iz] - pz) * 0.0012;

        // Damping
        vx *= 0.94;
        vy *= 0.94;
        vz *= 0.94;

        positions[ix] = px + vx;
        positions[iy] = py + vy;
        positions[iz] = pz + vz;

        velocities[ix] = vx;
        velocities[iy] = vy;
        velocities[iz] = vz;
      }

      geometry.attributes.position.needsUpdate = true;
      points.rotation.y = elapsed * 0.04;

      renderer.render(scene, camera);
    };
    animate();

    const handleResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("resize", handleResize);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [isDark]);

  return <div ref={mountRef} className="three-bg-wrap absolute inset-0 z-0" />;
}
