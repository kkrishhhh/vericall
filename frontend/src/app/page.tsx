"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { Moon, Sun, Shield, ArrowRight } from "lucide-react";
import { MenuToggleIcon } from "@/components/ui/menu-toggle-icon";
import { useScroll } from "@/components/ui/use-scroll";
import { translations } from "@/lib/translations";
import ScrollCard from "@/components/ui/scroll-card";

// ── Dynamic Three.js (no SSR) ──
const ThreeBackground = dynamic(() => import("@/components/ThreeBackground"), {
  ssr: false,
  loading: () => <div className="absolute inset-0" />,
});

// ── GSAP (client-only registration) ──
let gsap: any;
let ScrollTrigger: any;
if (typeof window !== "undefined") {
  gsap = require("gsap").default;
  ScrollTrigger = require("gsap/ScrollTrigger").ScrollTrigger;
  gsap.registerPlugin(ScrollTrigger);
}

// ═══════════════════════════════════════════════════════
//  CONSTANTS
// ═══════════════════════════════════════════════════════

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

const CYCLING_WORDS = ["Instant.", "Seamless.", "Secure.", "Intelligent."];

const MARQUEE_ITEMS = [
  "7M+ Happy Customers",
  "5 Minute KYC",
  "RBI V-CIP Compliant",
  "AAA CRISIL Rating",
  "Multilingual EN / HI / MR",
  "DPDPA 2023 Certified",
  "₹160M+ Disbursed",
  "40+ Year Legacy",
];

const STEPS = [
  { num: "01", title: "Receive Your Link", desc: "You receive a secure, one-time KYC link via WhatsApp or SMS.", icon: "📱" },
  { num: "02", title: "AI Video Interview", desc: "Our AI conducts a natural language interview in Hindi, English, or Marathi.", icon: "🤖" },
  { num: "03", title: "Document Verification", desc: "Upload Aadhaar, PAN, and address proof. AI verifies everything in seconds.", icon: "📄" },
  { num: "04", title: "Instant Decision", desc: "Receive your pre-approved loan offer backed by full regulatory compliance.", icon: "✅" },
];

const COMPLIANCE_BADGES = ["RBI V-CIP", "DPDPA 2023", "Aadhaar Act", "UAPA Sec 51A", "Verhoeff ✓", "CRISIL AAA"];

const FEATURES = [
  { title: "AI-Powered Interviews", desc: "Natural language conversation in your preferred language. Context-aware, adaptive, and compliant." },
  { title: "Smart Document Processing", desc: "Automated verification of identity documents with cross-validation and instant results." },
  { title: "Multilingual Support", desc: "Full experience in Hindi, Marathi & English — the video call, UI, and communications." },
  { title: "Liveness Verification", desc: "Real-time face matching and liveness checks ensure the person on camera is genuine." },
  { title: "Regulatory Compliance", desc: "Every decision references actual RBI KYC Master Directions. Full audit trail maintained." },
  { title: "Human Review Queue", desc: "Complex cases are automatically escalated to officers for manual review and approval." },
];

const STATS: { value: number; suffix: string; label: string; display?: string }[] = [
  { value: 7, suffix: "M+", label: "Happy Customers" },
  { value: 5, suffix: " Min", label: "Average KYC Time" },
  { value: 40, suffix: "+", label: "Year Legacy" },
  { value: 0, suffix: "", label: "Credit Rating", display: "AAA" },
];

function uniqueUrls(values: string[]): string[] {
  const out: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    if (!out.includes(trimmed)) out.push(trimmed);
  }
  return out;
}

// ═══════════════════════════════════════════════════════
//  HELPERS
// ═══════════════════════════════════════════════════════

function CountUp({ end, suffix = "", display }: { end: number; suffix?: string; display?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);
  const animated = useRef(false);

  useEffect(() => {
    if (!ref.current || display) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !animated.current) {
          animated.current = true;
          const duration = end >= 7 ? 4000 : 3000;
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min((now - start) / duration, 1);
            setCount(Math.floor((1 - Math.pow(1 - p, 3)) * end));
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, display]);

  if (display) return <span ref={ref}>{display}</span>;
  return <span ref={ref}>{count}{suffix}</span>;
}

// ═══════════════════════════════════════════════════════
//  MAIN LANDING PAGE
// ═══════════════════════════════════════════════════════

function LandingPageContent() {
  // ── State ──
  const [theme, setTheme] = useState<"dark" | "light">("light");
  const [titleNumber, setTitleNumber] = useState(0);
  const [showModal, setShowModal] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [headerHidden, setHeaderHidden] = useState(false);

  const scrolled = useScroll(10);
  const searchParams = useSearchParams();
  const campaignId = searchParams.get("campaign_id") || "";
  const backendCandidates = uniqueUrls([
    BACKEND,
    "http://127.0.0.1:8001",
    "http://127.0.0.1:8000",
  ]);
  const fetchBaseCandidates = uniqueUrls([
    "",
    BACKEND,
    "http://127.0.0.1:8001",
    "http://127.0.0.1:8000",
  ]);
  const [activeBackendUrl, setActiveBackendUrl] = useState<string>(backendCandidates[0] || "http://127.0.0.1:8001");

  const containerRef = useRef<HTMLDivElement>(null);
  const mainCardRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(0);

  // ── Word cycling ──
  useEffect(() => {
    const id = setTimeout(() => {
      setTitleNumber((prev) => (prev + 1) % CYCLING_WORDS.length);
    }, 2000);
    return () => clearTimeout(id);
  }, [titleNumber]);

  // ── Theme init (light default) ──
  useEffect(() => {
    const saved = localStorage.getItem("vantage-theme");
    if (saved === "dark") {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else {
      // Ensure light is the default
      setTheme("light");
      document.documentElement.classList.remove("dark");
      localStorage.setItem("vantage-theme", "light");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    if (next === "dark") document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");
    localStorage.setItem("vantage-theme", next);
  };

  // ── Mouse tracking for card sheen + phone tilt ──
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (window.scrollY > window.innerHeight * 2) return;
      cancelAnimationFrame(requestRef.current);
      requestRef.current = requestAnimationFrame(() => {
        if (mainCardRef.current) {
          const rect = mainCardRef.current.getBoundingClientRect();
          mainCardRef.current.style.setProperty("--mouse-x", `${e.clientX - rect.left}px`);
          mainCardRef.current.style.setProperty("--mouse-y", `${e.clientY - rect.top}px`);
        }
        if (mockupRef.current && gsap) {
          const xVal = (e.clientX / window.innerWidth - 0.5) * 2;
          const yVal = (e.clientY / window.innerHeight - 0.5) * 2;
          gsap.to(mockupRef.current, {
            rotationY: xVal * 12,
            rotationX: -yVal * 12,
            ease: "power3.out",
            duration: 1.2,
          });
        }
      });
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      cancelAnimationFrame(requestRef.current);
    };
  }, []);

  // ── GSAP Cinematic Scroll Timeline ──
  useEffect(() => {
    if (!gsap || !ScrollTrigger || !containerRef.current) return;

    const ctx = gsap.context(() => {
      // Initial states
      gsap.set(".hero-title-1", { autoAlpha: 0, y: 60, scale: 0.85, filter: "blur(20px)" });
      gsap.set(".hero-title-2", { autoAlpha: 1, clipPath: "inset(0 100% 0 0)" });
      gsap.set(".hero-subtitle", { autoAlpha: 0, y: 20 });
      gsap.set(".hero-cta-btn", { autoAlpha: 0, y: 20 });
      gsap.set(".main-card", { y: window.innerHeight + 200, autoAlpha: 1 });
      gsap.set([".card-left-text", ".card-right-text", ".mockup-scroll-wrapper", ".floating-badge", ".phone-widget"], { autoAlpha: 0 });
      gsap.set(".vantage-story", { autoAlpha: 0, scale: 0.85, filter: "blur(30px)" });

      // Intro animation (timed, not scroll)
      const intro = gsap.timeline({ delay: 0.3 });
      intro
        .to(".hero-title-1", { autoAlpha: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 1.8, ease: "expo.out" })
        .to(".hero-title-2", { clipPath: "inset(0 0% 0 0)", duration: 1.4, ease: "power4.inOut" }, "-=1.0")
        .to(".hero-subtitle", { autoAlpha: 1, y: 0, duration: 0.8, ease: "power3.out" }, "-=0.5")
        .to(".hero-cta-btn", { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" }, "-=0.3");

      // Scroll-driven cinematic timeline
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: "top top",
          end: "+=5000",
          pin: true,
          scrub: 1,
          anticipatePin: 1,
          onUpdate: (self: any) => {
            const p = self.progress;
            if (p > 0.12 && p < 0.85) {
              setHeaderHidden(true);
            } else {
              setHeaderHidden(false);
            }
          },
        },
      });

      tl
        // Phase 1: Hero text fades, card rises
        .to([".hero-text-wrapper", ".three-bg-wrap"], { scale: 1.15, filter: "blur(20px)", opacity: 0.2, ease: "power2.inOut", duration: 2 }, 0)
        .to(".main-card", { y: 0, ease: "power3.inOut", duration: 2 }, 0)

        // Phase 2: Card expands to full viewport
        .to(".main-card", { width: "100%", height: "100%", borderRadius: "0px", ease: "power3.inOut", duration: 1.5 })

        // Phase 3: Content reveals with 3D entrance
        .fromTo(".mockup-scroll-wrapper",
          { y: 300, z: -500, rotationX: 50, rotationY: -30, autoAlpha: 0, scale: 0.6 },
          { y: 0, z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 2.5 },
          "-=0.8"
        )
        .fromTo(".phone-widget",
          { y: 40, autoAlpha: 0, scale: 0.95 },
          { y: 0, autoAlpha: 1, scale: 1, stagger: 0.15, ease: "back.out(1.2)", duration: 1.5 },
          "-=1.5"
        )
        .to(".progress-ring", { attr: { "stroke-dashoffset": 67 }, duration: 2, ease: "power3.inOut" }, "-=1.2")
        .to(".counter-val", { innerHTML: 5, snap: { innerHTML: 1 }, duration: 2, ease: "expo.out" }, "-=2.0")
        .fromTo(".floating-badge",
          { y: 100, autoAlpha: 0, scale: 0.7, rotationZ: -10 },
          { y: 0, autoAlpha: 1, scale: 1, rotationZ: 0, ease: "back.out(1.5)", duration: 1.5, stagger: 0.2 },
          "-=2.0"
        )
        .fromTo(".card-left-text",
          { x: -50, autoAlpha: 0 },
          { x: 0, autoAlpha: 1, ease: "power4.out", duration: 1.5 },
          "-=1.5"
        )
        .fromTo(".card-right-text",
          { x: 50, autoAlpha: 0, scale: 0.8 },
          { x: 0, autoAlpha: 1, scale: 1, ease: "expo.out", duration: 1.5 },
          "<"
        )

        // Pause for reading
        .to({}, { duration: 2.5 })

        // Phase 4: Everything exits, VANTAGE story fades in
        .to(".hero-text-wrapper", { autoAlpha: 0 })
        .to([".mockup-scroll-wrapper", ".floating-badge", ".card-left-text", ".card-right-text"], {
          scale: 0.9, y: -40, z: -200, autoAlpha: 0, ease: "power3.in", duration: 1.2, stagger: 0.05,
        })

        // Phase 5: Card morphs into story section
        .to(".main-card", {
          background: "linear-gradient(145deg, #0F1629 0%, #1B2B6B 50%, #0F1629 100%)",
          ease: "power3.inOut",
          duration: 1,
        })
        .to(".vantage-story", {
          autoAlpha: 1,
          scale: 1,
          filter: "blur(0px)",
          ease: "expo.out",
          duration: 2,
        }, "-=0.5")

        // Pause for reading story
        .to({}, { duration: 3 })

        // Phase 6: Everything exits — hide particles too so no blank section
        .to(".vantage-story", { autoAlpha: 0, y: -60, ease: "power3.in", duration: 1 })
        .to(".three-bg-wrap", { autoAlpha: 0, duration: 0.8 }, "<")
        .to(".main-card", { y: -window.innerHeight - 300, ease: "power3.in", duration: 1.5 }, "-=0.5")
        .set(".hero-text-wrapper", { display: "none" });
    }, containerRef);

    return () => {
      ctx.revert();
    };
  }, []);

  // ── Mobile menu body lock ──
  useEffect(() => {
    document.body.style.overflow = mobileMenuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen]);

  // ── Handlers ──
  const openModal = () => {
    setShowModal(true);
    setError("");
    setSuccessMsg("");
    document.body.style.overflow = "hidden";
  };
  const closeModal = () => {
    setShowModal(false);
    document.body.style.overflow = "";
  };

  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 12000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  };

  const buildApiUrl = (baseUrl: string, path: string) => {
    if (!baseUrl) return path;
    return `${baseUrl.replace(/\/+$/, "")}${path}`;
  };

  const fetchWithBackendFallback = async (path: string, options: RequestInit = {}, timeoutMs = 12000) => {
    let lastError: unknown = null;
    for (const baseUrl of fetchBaseCandidates) {
      try {
        const res = await fetchWithTimeout(buildApiUrl(baseUrl, path), options, timeoutMs);
        setActiveBackendUrl(baseUrl || "same-origin");
        return { res, baseUrl };
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error("Backend not reachable");
  };

  const handleVideoKycRequest = async () => {
    if (fullName.trim().length < 2) { setError("Please enter full name"); return; }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setError("Please enter a valid email"); return; }
    if (phone.length < 10) { setError("Please enter a valid 10-digit phone number"); return; }
    if (!consentAccepted) { setError("Please provide consent to continue"); return; }
    setError(""); setSuccessMsg(""); setLoading(true);
    try {
      const { res } = await fetchWithBackendFallback("/api/video-kyc/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: fullName.trim(),
          email: email.trim(),
          mobile_number: phone,
          consent_accepted: consentAccepted,
          language: "en",
          campaign_id: campaignId || undefined,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload?.detail || "Failed to send Video KYC email");
      setSuccessMsg("Video KYC link and OTP have been sent to the customer email.");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unable to send Video KYC request.";
      const isAbort = err instanceof Error && err.name === "AbortError";
      if (isAbort) {
        setError(`Request timed out after 12s. Checked: ${backendCandidates.join(", ")}`);
      } else {
        setError(message || `Unable to send Video KYC request. Checked: ${backendCandidates.join(", ")}`);
      }
    }
    finally { setLoading(false); }
  };
  const t = translations.en;

  // ═══════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════

  return (
    <div style={{ background: "var(--page-bg)", color: "var(--page-fg)", minHeight: "100vh", fontFamily: "var(--font-jakarta)" }}>

      {/* ═══════════════════════════════════════════════════
          HEADER
      ═══════════════════════════════════════════════════ */}
      <header
        className="fixed top-0 left-0 right-0 z-[60] transition-all duration-500"
        style={{
          transform: headerHidden ? "translateY(-100%)" : "translateY(0)",
          opacity: headerHidden ? 0 : 1,
        }}
      >
        <div
          className="mx-auto w-full transition-all duration-500 ease-out"
          style={{
            maxWidth: scrolled ? "56rem" : "100%",
            marginTop: scrolled ? "16px" : "0",
            borderRadius: scrolled ? "12px" : "0",
            background: scrolled
              ? (theme === "dark" ? "rgba(5,5,8,0.85)" : "rgba(255,255,255,0.85)")
              : "transparent",
            backdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none",
            WebkitBackdropFilter: scrolled ? "blur(20px) saturate(180%)" : "none",
            border: scrolled ? "1px solid var(--card-border)" : "1px solid transparent",
            boxShadow: scrolled ? "0 4px 20px rgba(0,0,0,0.08)" : "none",
          }}
        >
          <nav className="flex h-14 items-center justify-between px-5">
            <div className="flex items-center gap-3">
              <Image src="/pfl-logo.png" alt="Poonawalla Fincorp" width={180} height={54} className="h-9 w-auto object-contain" priority />
              <div className="w-px h-8 shrink-0" style={{ background: "var(--card-border)" }} />
              <div className="leading-tight">
                <span className="text-lg font-bold block tracking-wide" style={{ color: "var(--page-fg)" }}>VANTAGE</span>
                <span className="text-[9px] font-medium block" style={{ color: "var(--muted)" }}>by Poonawalla Fincorp</span>
              </div>
            </div>

            <div className="hidden md:flex items-center gap-1">
              {["How It Works", "Security"].map((link) => (
                <a key={link} href={`#${link.toLowerCase().replace(/\s+/g, "-")}`}
                  className="text-sm font-medium px-3 py-2 rounded-lg transition-colors duration-200"
                  style={{ color: "var(--muted)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "var(--page-fg)"; e.currentTarget.style.background = "var(--card-border)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted)"; e.currentTarget.style.background = "transparent"; }}>
                  {link}
                </a>
              ))}
              <button onClick={toggleTheme} className="w-9 h-9 rounded-lg flex items-center justify-center transition-all duration-200 cursor-pointer ml-1" style={{ border: "1px solid var(--card-border)", color: "var(--page-fg)" }} aria-label="Toggle theme">
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button onClick={openModal} className="text-sm font-semibold text-white rounded-lg px-5 py-2 ml-2 transition-all duration-300 hover:-translate-y-0.5 cursor-pointer" style={{ background: "linear-gradient(135deg, #1B2B6B 0%, #2563EB 100%)", boxShadow: "0 4px 15px rgba(27,43,107,0.3)" }}>
                Request Video KYC
              </button>
            </div>

            <div className="flex md:hidden items-center gap-2">
              <button onClick={toggleTheme} className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer" style={{ border: "1px solid var(--card-border)", color: "var(--page-fg)" }} aria-label="Toggle theme">
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer" style={{ border: "1px solid var(--card-border)", color: "var(--page-fg)" }}>
                <MenuToggleIcon open={mobileMenuOpen} className="size-5" duration={300} />
              </button>
            </div>
          </nav>
        </div>

        <div className={`fixed top-14 right-0 bottom-0 left-0 z-50 flex flex-col md:hidden transition-all duration-300 ${mobileMenuOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
          style={{ background: theme === "dark" ? "rgba(5,5,8,0.95)" : "rgba(255,255,255,0.95)", backdropFilter: "blur(16px)" }}>
          <div className="flex flex-col justify-between h-full p-5">
            <div className="space-y-1">
              {["How It Works", "Security"].map((link) => (
                <a key={link} href={`#${link.toLowerCase().replace(/\s+/g, "-")}`} onClick={() => setMobileMenuOpen(false)}
                  className="block text-base font-medium px-4 py-3 rounded-xl transition-colors" style={{ color: "var(--page-fg)" }}>{link}</a>
              ))}
            </div>
            <button onClick={() => { setMobileMenuOpen(false); openModal(); }}
              className="w-full py-3 rounded-xl text-white font-semibold text-sm cursor-pointer"
              style={{ background: "linear-gradient(135deg, #1B2B6B 0%, #2563EB 100%)" }}>Request Video KYC</button>
          </div>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════
          HERO — GSAP Pinned Cinematic Section
      ═══════════════════════════════════════════════════ */}
      <div
        ref={containerRef}
        className="relative w-screen h-screen overflow-hidden flex items-center justify-center"
        style={{ background: "var(--page-bg)", perspective: "1500px" }}
      >
        <div className="film-grain" aria-hidden="true" />
        <div className="three-bg-wrap absolute inset-0 z-0">
          <ThreeBackground isDark={theme === "dark"} />
        </div>

        {/* ── HERO TEXT LAYER ── */}
        <div className="hero-text-wrapper absolute z-10 flex flex-col items-center justify-center text-center w-screen px-5">
          <h1
            className="hero-title-1 gsap-reveal text-4xl sm:text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight"
            style={{
              color: "var(--page-fg)",
              textShadow: theme === "dark" ? "0 0 60px rgba(255,255,255,0.1)" : "0 0 40px rgba(255,255,255,0.8)",
            }}
          >
            Your KYC Journey,
          </h1>

          <div className="hero-title-2 gsap-reveal relative flex w-full justify-center overflow-hidden text-4xl sm:text-5xl md:text-7xl lg:text-8xl" style={{ height: "1.3em" }}>
            {CYCLING_WORDS.map((word, i) => (
              <motion.span
                key={i}
                className="absolute font-extrabold tracking-tighter"
                style={{
                  background: "linear-gradient(180deg, var(--page-fg) 0%, var(--muted) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
                transition={{ type: "spring", stiffness: 50 }}
                animate={titleNumber === i ? { y: 0, opacity: 1 } : { y: titleNumber > i ? -150 : 150, opacity: 0 }}
              >
                {word}
              </motion.span>
            ))}
          </div>

          {/* Subtitle — with readable background pill */}
          <p
            className="hero-subtitle mt-6 max-w-xl text-base sm:text-lg px-6 py-3 rounded-2xl"
            style={{
              color: theme === "dark" ? "var(--muted)" : "#334155",
              background: theme === "dark" ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.75)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            Complete your loan application in 5 minutes through a live AI-powered video call.
          </p>

          <button
            onClick={openModal}
            className="hero-cta-btn mt-10 px-8 py-3.5 rounded-2xl text-white font-semibold text-base transition-all duration-300 hover:-translate-y-1 cursor-pointer flex items-center gap-2"
            style={{ background: "linear-gradient(135deg, #1B2B6B 0%, #2563EB 100%)", boxShadow: "0 4px 20px rgba(27,43,107,0.35)" }}
          >
            Request Video KYC <ArrowRight size={18} />
          </button>
        </div>

        {/* ── CINEMATIC CARD LAYER ── */}
        <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none" style={{ perspective: "1500px" }}>
          <div
            ref={mainCardRef}
            className="main-card premium-depth-card relative overflow-hidden gsap-reveal flex items-center justify-center pointer-events-auto w-[92vw] md:w-[85vw] h-[92vh] md:h-[85vh] rounded-[32px] md:rounded-[40px]"
          >
            <div className="card-sheen" aria-hidden="true" />

            {/* ── VANTAGE STORY OVERLAY (replaces blank section) ── */}
            <div className="vantage-story gsap-reveal absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
              {/* Blurred VANTAGE logo watermark in background */}
              <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
                <Image
                  src="/vantage-logo.png"
                  alt=""
                  width={600}
                  height={600}
                  className="w-[50vw] max-w-[600px] h-auto opacity-[0.04]"
                  style={{ filter: "blur(2px)" }}
                  aria-hidden="true"
                />
              </div>

              {/* Story content */}
              <div className="relative z-10 max-w-3xl mx-auto px-8 text-center">
                <div className="inline-flex items-center gap-3 mb-8">
                  <Image src="/pfl-logo.png" alt="PFL" width={140} height={42} className="h-10 w-auto brightness-200 object-contain" />
                  <div className="w-px h-8 bg-white/20" />
                  <Image src="/vantage-logo.png" alt="VANTAGE" width={140} height={42} className="h-8 w-auto brightness-200 object-contain" />
                </div>
                <h2 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight mb-6">
                  The Future of Customer Verification
                </h2>
                <p className="text-base md:text-lg text-blue-100/50 leading-relaxed max-w-2xl mx-auto mb-4">
                  <span className="text-white font-semibold">Poonawalla Fincorp</span>, with a 40+ year legacy and AAA CRISIL rating, serves 7M+ customers. <span className="text-white font-semibold">VANTAGE</span> is our AI-powered V-CIP platform — turning a 5-day KYC process into a 5-minute secure video conversation.
                </p>
                <p className="text-sm text-blue-100/30 max-w-lg mx-auto">
                  Multilingual AI interviews • Real-time document verification • Liveness detection • Instant loan decisions — all RBI compliant.
                </p>
                <button
                  onClick={openModal}
                  className="pointer-events-auto mt-10 px-10 py-4 rounded-2xl text-white font-semibold text-lg transition-all duration-300 hover:-translate-y-1 cursor-pointer inline-flex items-center gap-2"
                  style={{ background: "linear-gradient(135deg, #2563EB 0%, #3B82F6 100%)", boxShadow: "0 4px 20px rgba(37,99,235,0.4)" }}
                >
                  Begin Your KYC <ArrowRight size={20} />
                </button>
              </div>
            </div>

            {/* Responsive grid for phone section */}
            <div className="relative w-full h-full max-w-7xl mx-auto px-4 lg:px-12 flex flex-col justify-evenly lg:grid lg:grid-cols-3 items-center lg:gap-8 z-10 py-6 lg:py-0">

              {/* 1. BRAND NAME */}
              <div className="card-right-text gsap-reveal order-1 lg:order-3 flex justify-center lg:justify-end z-20 w-full">
                <h2 className="text-5xl sm:text-6xl md:text-[6rem] lg:text-[8rem] font-black uppercase tracking-tighter text-card-silver">
                  VANTAGE
                </h2>
              </div>

              {/* 2. iPHONE MOCKUP */}
              <div className="mockup-scroll-wrapper order-2 relative w-full h-[340px] sm:h-[380px] lg:h-[600px] flex items-center justify-center z-10" style={{ perspective: "1000px" }}>
                <div className="relative w-full h-full flex items-center justify-center transform scale-[0.55] sm:scale-[0.65] md:scale-[0.85] lg:scale-100">
                  <div
                    ref={mockupRef}
                    className="relative w-[280px] h-[580px] rounded-[3rem] iphone-bezel flex flex-col will-change-transform"
                    style={{ transformStyle: "preserve-3d" }}
                  >
                    <div className="absolute top-[120px] -left-[3px] w-[3px] h-[25px] hardware-btn rounded-l-md" aria-hidden="true" />
                    <div className="absolute top-[160px] -left-[3px] w-[3px] h-[45px] hardware-btn rounded-l-md" aria-hidden="true" />
                    <div className="absolute top-[220px] -left-[3px] w-[3px] h-[45px] hardware-btn rounded-l-md" aria-hidden="true" />
                    <div className="absolute top-[170px] -right-[3px] w-[3px] h-[70px] hardware-btn rounded-r-md scale-x-[-1]" aria-hidden="true" />

                    <div className="absolute inset-[7px] bg-[#050914] rounded-[2.5rem] overflow-hidden text-white z-10" style={{ boxShadow: "inset 0 0 15px rgba(0,0,0,1)" }}>
                      <div className="absolute inset-0 screen-glare z-40 pointer-events-none" aria-hidden="true" />
                      <div className="absolute top-[5px] left-1/2 -translate-x-1/2 w-[100px] h-[28px] bg-black rounded-full z-50 flex items-center justify-end px-3" style={{ boxShadow: "inset 0 -1px 2px rgba(255,255,255,0.1)" }}>
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" style={{ boxShadow: "0 0 8px rgba(34,197,94,0.8)" }} />
                      </div>

                      <div className="relative w-full h-full pt-12 px-5 pb-8 flex flex-col overflow-hidden">
                        <div className="phone-widget flex justify-between items-center mb-4">
                          <div>
                            <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold block mb-0.5">LIVE SESSION</span>
                            <span className="text-lg font-bold tracking-tight text-white">VANTAGE KYC</span>
                          </div>
                          <div className="w-9 h-9 rounded-full bg-white/5 text-neutral-200 flex items-center justify-center font-bold text-sm border border-white/10" style={{ boxShadow: "0 4px 8px rgba(0,0,0,0.5)" }}>KT</div>
                        </div>

                        <div className="phone-widget relative w-32 h-32 mx-auto flex items-center justify-center mb-4" style={{ filter: "drop-shadow(0 15px 25px rgba(0,0,0,0.8))" }}>
                          <svg className="absolute inset-0 w-full h-full" aria-hidden="true">
                            <circle cx="64" cy="64" r="56" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="9" />
                            <circle className="progress-ring" cx="64" cy="64" r="56" fill="none" stroke="#3B82F6" strokeWidth="9" strokeDasharray="352" strokeDashoffset="352" />
                          </svg>
                          <div className="text-center z-10 flex flex-col items-center">
                            <span className="text-[9px] text-blue-200/50 uppercase tracking-[0.1em] font-bold">Verified</span>
                            <span className="counter-val text-2xl font-extrabold tracking-tighter text-white">0</span>
                            <span className="text-[7px] text-blue-200/30 uppercase font-bold mt-0.5">checks passed</span>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <div className="phone-widget widget-depth rounded-2xl p-2.5 flex items-center">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/5 flex items-center justify-center mr-2.5 border border-blue-400/20">
                              <svg className="w-3.5 h-3.5 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            </div>
                            <div>
                              <div className="text-[11px] font-medium text-white/80">Identity Verified</div>
                              <div className="text-[9px] text-white/30">Aadhaar + PAN validated</div>
                            </div>
                          </div>
                          <div className="phone-widget widget-depth rounded-2xl p-2.5 flex items-center">
                            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 flex items-center justify-center mr-2.5 border border-emerald-400/20">
                              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                            </div>
                            <div>
                              <div className="text-[11px] font-medium text-white/80">Liveness Confirmed</div>
                              <div className="text-[9px] text-white/30">Face match: 94% confidence</div>
                            </div>
                          </div>
                        </div>

                        <button className="phone-widget mt-4 w-full py-3 rounded-2xl text-white text-sm font-semibold cursor-default"
                          style={{ background: "linear-gradient(135deg, #1B2B6B 0%, #2563EB 100%)", boxShadow: "0 4px 16px rgba(37,99,235,0.4)" }}>
                          Get Started →
                        </button>

                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-[120px] h-[4px] bg-white/20 rounded-full" style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.5)" }} />
                      </div>
                    </div>
                  </div>

                  {/* Floating badges — repositioned further from phone */}
                  <div className="floating-badge absolute flex top-[-10px] lg:top-0 left-[-20px] sm:left-[-40px] lg:left-[-100px] floating-ui-badge rounded-xl lg:rounded-2xl p-3 lg:p-4 items-center gap-3 z-30">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-b from-blue-500/20 to-blue-900/10 flex items-center justify-center border border-blue-400/30">
                      <span className="text-base lg:text-xl" aria-hidden="true">🛡️</span>
                    </div>
                    <div>
                      <p className="text-white text-xs lg:text-sm font-bold tracking-tight">RBI V-CIP Verified</p>
                      <p className="text-blue-200/50 text-[10px] lg:text-xs font-medium">Compliance confirmed ✓</p>
                    </div>
                  </div>

                  <div className="floating-badge absolute flex bottom-[-10px] lg:bottom-10 right-[-20px] sm:right-[-40px] lg:right-[-100px] floating-ui-badge rounded-xl lg:rounded-2xl p-3 lg:p-4 items-center gap-3 z-30">
                    <div className="w-8 h-8 lg:w-10 lg:h-10 rounded-full bg-gradient-to-b from-blue-500/20 to-blue-900/10 flex items-center justify-center border border-blue-400/30">
                      <span className="text-base lg:text-lg" aria-hidden="true">⚡</span>
                    </div>
                    <div>
                      <p className="text-white text-xs lg:text-sm font-bold tracking-tight">Decision in 47s</p>
                      <p className="text-blue-200/50 text-[10px] lg:text-xs font-medium">AI-powered approval</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* 3. DESCRIPTION TEXT */}
              <div className="card-left-text gsap-reveal order-3 lg:order-1 flex flex-col justify-center text-center lg:text-left z-20 w-full px-4 lg:px-0">
                <h3 className="text-white text-xl sm:text-2xl lg:text-4xl font-bold tracking-tight">
                  Verification, reimagined.
                </h3>
                <p className="hidden md:block text-blue-100/60 text-sm lg:text-base leading-relaxed mt-4 max-w-sm lg:max-w-none">
                  <span className="text-white font-semibold">VANTAGE</span> transforms KYC from a 5-day branch visit into a 5-minute secure video call — with AI that understands context, verifies identity, and delivers decisions.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          HOW IT WORKS — ScrollCard Lenis
      ═══════════════════════════════════════════════════ */}
      <section id="how-it-works">
        <ScrollCard />
      </section>

      {/* ═══════════════════════════════════════════════════
          MARQUEE STRIP
      ═══════════════════════════════════════════════════ */}
      <section style={{ background: "#1B2B6B", overflow: "hidden", padding: "14px 0" }}>
        <div className="flex" style={{ animation: "marquee 25s linear infinite", width: "max-content" }}>
          {[...MARQUEE_ITEMS, ...MARQUEE_ITEMS].map((item, i) => (
            <span key={i} className="mx-8 text-sm font-medium whitespace-nowrap" style={{ color: i % 3 === 0 ? "#93C5FD" : "white", fontFamily: "var(--font-mono)" }}>
              {item}
            </span>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          TRUST & COMPLIANCE
      ═══════════════════════════════════════════════════ */}
      <section id="security" className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: "#0F1629" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <motion.div initial={{ x: -50, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7 }}>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white tracking-tight leading-tight">Built for India&apos;s Regulated Financial System</h2>
              <p className="mt-4 text-base leading-relaxed text-white/50">Every decision backed by RBI KYC Master Direction 2016, verified through semantic search across regulatory databases.</p>
            </motion.div>
            <div className="grid grid-cols-3 gap-3">
              {COMPLIANCE_BADGES.map((badge, i) => (
                <motion.div key={badge} className="px-3 py-4 rounded-xl text-center text-sm font-medium text-white" style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(37,99,235,0.25)" }}
                  initial={{ y: 30, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.4, delay: i * 0.08 }}>
                  {badge}
                </motion.div>
              ))}
            </div>
          </div>
          <motion.blockquote className="mt-16 max-w-3xl mx-auto text-center" initial={{ y: 30, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.7 }}>
            <p className="text-lg italic leading-relaxed text-white/55" style={{ fontFamily: "var(--font-playfair)" }}>
              &ldquo;AI is more than a tool — it is reshaping how organisations think, decide, and compete. Our focus is on using it responsibly by combining machine precision with human judgment.&rdquo;
            </p>
            <cite className="block mt-4 text-sm not-italic text-blue-300/70">— Arvind Kapil, MD &amp; CEO, Poonawalla Fincorp</cite>
          </motion.blockquote>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          STATS ROW
      ═══════════════════════════════════════════════════ */}
      <section className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: "var(--page-bg)" }}>
        <div className="max-w-5xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
          {STATS.map((stat, i) => (
            <motion.div key={stat.label} initial={{ y: 30, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.5, delay: i * 0.1 }}>
              <div className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight" style={{ color: "var(--page-fg)" }}>
                <CountUp end={stat.value} suffix={stat.suffix} display={stat.display} />
              </div>
              <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{stat.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          FEATURE GRID
      ═══════════════════════════════════════════════════ */}
      <section id="features" className="py-20 sm:py-28 px-5 sm:px-8" style={{ background: "var(--section-bg)" }}>
        <div className="max-w-6xl mx-auto">
          <motion.h2 className="text-center mb-14 text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight" style={{ color: "var(--page-fg)" }}
            initial={{ y: 40, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, margin: "-100px" }}>Platform Capabilities</motion.h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((feat, i) => (
              <motion.div key={feat.title} className="p-6 rounded-2xl transition-all duration-300 hover:-translate-y-1 group cursor-default bg-white hover:bg-blue-50 dark:bg-white/5 dark:hover:bg-blue-900/20 border border-black/5 dark:border-white/10"
                initial={{ y: 40, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.5, delay: i * 0.08 }}
                whileHover={{ boxShadow: "0 8px 30px rgba(37,99,235,0.08), 0 0 0 1px rgba(37,99,235,0.15)" }}>
                <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--page-fg)" }}>{feat.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>{feat.desc}</p>
                <div className="mt-4 h-0.5 w-12 rounded transition-all duration-300 group-hover:w-full" style={{ background: "linear-gradient(90deg, #1B2B6B, #2563EB)" }} />
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════
          FOOTER
      ═══════════════════════════════════════════════════ */}
      <footer style={{ background: "#0F1629" }}>
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16">
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-12">
            <div>
              <div className="flex items-center gap-4 mb-5">
                <Image src="/pfl-logo.png" alt="Poonawalla Fincorp" width={180} height={54} className="h-11 w-auto brightness-200 object-contain" />
                <div className="w-px h-9 bg-white/15" />
                <Image src="/vantage-logo.png" alt="VANTAGE" width={120} height={36} className="h-8 w-auto brightness-200 object-contain" />
              </div>
              <p className="text-sm text-white/35 leading-relaxed">
                Unit No. 2401, 24th Floor, Altimus,<br />Dr G.M. Bhosale Marg, Worli,<br />Mumbai, Maharashtra — 400018
              </p>
              <p className="text-sm text-white/35 mt-3">Toll Free: <span className="text-white/55">1800-266-3201</span></p>
            </div>
            <div className="grid grid-cols-2 gap-3 content-start">
              {["Privacy Policy", "Terms & Conditions", "RBI Compliance", "DPDPA Policy"].map((link) => (
                <a key={link} href="#" className="text-sm text-white/35 hover:text-white transition-colors">{link}</a>
              ))}
              <Link href="/dashboard" className="text-sm text-white/35 hover:text-white transition-colors">Applications</Link>
              <Link href="/admin" className="text-sm text-white/35 hover:text-white transition-colors font-medium">Admin Portal</Link>
            </div>
            <div>
              <p className="text-sm text-white/20 mb-4">Connect with us</p>
              <div className="flex gap-3">
                <a href="https://www.linkedin.com/company/poonawalla-fincorp/" target="_blank" rel="noopener noreferrer" aria-label="LinkedIn" className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:-translate-y-1 text-white/45 hover:text-white" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                </a>
                <a href="https://www.instagram.com/poonawallafincorp/" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:-translate-y-1 text-white/45 hover:text-white" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" /></svg>
                </a>
                <a href="https://x.com/PoonwallaFin" target="_blank" rel="noopener noreferrer" aria-label="X (Twitter)" className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 hover:-translate-y-1 text-white/45 hover:text-white" style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
                </a>
              </div>
            </div>
          </div>
        </div>
        <div className="border-t px-5 sm:px-8 py-4 flex flex-wrap items-center justify-between gap-4" style={{ borderColor: "rgba(255,255,255,0.05)" }}>
          <p className="text-xs text-white/25">© 2026 Poonawalla Fincorp Limited | VANTAGE is a product of Poonawalla Fincorp</p>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs" style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.15)", color: "#93C5FD" }}>
            <Shield size={12} /> Regulated by Reserve Bank of India
          </div>
        </div>
      </footer>

      {/* ═══════════════════════════════════════════════════
          KYC APPLICATION MODAL
      ═══════════════════════════════════════════════════ */}
      <AnimatePresence>
        {showModal && (
          <motion.div className="fixed inset-0 z-[100] flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="absolute inset-0" style={{ background: "rgba(5, 5, 8, 0.88)", backdropFilter: "blur(12px)" }} onClick={closeModal} />
            <motion.div className="relative z-10 w-full max-w-md mx-4 rounded-2xl p-7 sm:p-8"
              style={{ background: "linear-gradient(145deg, #162C6D 0%, #0A101D 100%)", border: "1px solid rgba(255,255,255,0.08)", boxShadow: "0 25px 50px rgba(0,0,0,0.5)" }}
              initial={{ scale: 0.9, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 40, opacity: 0 }} transition={{ duration: 0.3 }}>
              <button onClick={closeModal} className="absolute top-4 right-4 text-white/25 hover:text-white transition cursor-pointer">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 mb-3">
                  <Image src="/pfl-logo.png" alt="PFL" width={100} height={30} className="h-7 w-auto brightness-200 object-contain" />
                  <span className="text-white font-semibold text-sm">VANTAGE</span>
                </div>
                <h2 className="text-xl font-semibold text-white">Request Video KYC</h2>
                <p className="text-sm text-white/35 mt-1">Enter customer details to send secure KYC link and OTP.</p>
              </div>

              {campaignId && (
                <div className="mb-4 rounded-xl px-4 py-3 text-xs" style={{ background: "rgba(37,99,235,0.08)", border: "1px solid rgba(37,99,235,0.2)", color: "#93C5FD" }}>
                  Campaign: {campaignId}
                </div>
              )}

              <div className="space-y-4 mb-5">
                <div>
                  <label className="block text-sm text-white/50 mb-2">Full Name</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => { setFullName(e.target.value); setError(""); }}
                    placeholder="Enter full name"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white placeholder-white/20 focus:outline-none focus:border-blue-500 transition text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/50 mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(""); }}
                    placeholder="Enter email address"
                    className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/[0.1] text-white placeholder-white/20 focus:outline-none focus:border-blue-500 transition text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm text-white/50 mb-2">Mobile Number</label>
                  <div className="flex">
                    <span className="inline-flex items-center px-4 rounded-l-xl bg-white/[0.05] border border-r-0 border-white/[0.1] text-sm text-white/35">+91</span>
                    <input
                      type="tel"
                      maxLength={10}
                      value={phone}
                      onChange={(e) => { setPhone(e.target.value.replace(/\D/g, "")); setError(""); }}
                      placeholder="Enter 10-digit mobile"
                      className="flex-1 px-4 py-3 rounded-r-xl bg-white/[0.05] border border-white/[0.1] text-white placeholder-white/20 focus:outline-none focus:border-blue-500 transition text-sm"
                    />
                  </div>
                </div>
                <label className="flex items-start gap-3 cursor-pointer group rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4 rounded accent-blue-500"
                    checked={consentAccepted}
                    onChange={(e) => { setConsentAccepted(e.target.checked); setError(""); }}
                  />
                  <div>
                    <p className="text-sm font-medium text-white/80 group-hover:text-white transition">I consent to video KYC and data processing</p>
                  </div>
                </label>
              </div>

              {error && <p className="text-red-400 text-xs text-center mb-3">{error}</p>}
              {successMsg && <p className="text-emerald-400 text-xs text-center mb-3">{successMsg}</p>}

              <button
                onClick={handleVideoKycRequest}
                disabled={loading || !fullName.trim() || !email.trim() || phone.length < 10 || !consentAccepted}
                className="w-full py-3 rounded-xl text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-all hover:brightness-110"
                style={{ background: "linear-gradient(135deg, #1B2B6B 0%, #2563EB 100%)" }}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Sending request...
                  </span>
                ) : "Request Video KYC"}
              </button>
              <p className="text-[11px] text-white/30 mt-2 text-center">Backend: {activeBackendUrl}</p>

              <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-white/20">
                <span className="flex items-center gap-1"><Shield size={10} className="text-green-400/50" />{t.rbiCompliant}</span>
                <span>•</span>
                <span>{t.endToEndEncrypted}</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function LandingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--page-bg)" }}>
        <div className="animate-pulse text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4" style={{ background: "linear-gradient(135deg, #1B2B6B, #2563EB)" }} />
          <p style={{ color: "var(--muted)" }}>Loading VANTAGE...</p>
        </div>
      </div>
    }>
      <LandingPageContent />
    </Suspense>
  );
}
