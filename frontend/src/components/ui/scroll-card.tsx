'use client';
import { ReactLenis } from 'lenis/react';
import React, { useRef, forwardRef } from 'react';
import { motion } from 'framer-motion';

interface ArticleCardData {
  num: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  rotation: string;
}

const articleCardsData: ArticleCardData[] = [
  {
    num: "01",
    title: "Receive Your Link",
    description: "You receive a secure, one-time KYC link via WhatsApp or SMS. No app downloads required — just tap and start.",
    icon: "📱",
    color: '#0F1629', // Navy base
    rotation: 'rotate-6',
  },
  {
    num: "02",
    title: "AI Video Interview",
    description: "Our AI conducts a natural language interview in Hindi, English, or Marathi. It adapts to your pace and language.",
    icon: "🤖",
    color: '#162C6D', // Lighter navy
    rotation: 'rotate-0',
  },
  {
    num: "03",
    title: "Document Verification",
    description: "Upload Aadhaar, PAN, and address proof. AI verifies everything in seconds with cross-validation checks.",
    icon: "📄",
    color: '#1B3A8A', // Brighter blue
    rotation: '-rotate-6',
  },
  {
    num: "04",
    title: "Instant Decision",
    description: "Receive your pre-approved loan offer backed by full regulatory compliance. Decision in under 60 seconds.",
    icon: "✅",
    color: '#2563EB', // Brand blue
    rotation: 'rotate-0',
  },
];

const ScrollCard = forwardRef<HTMLElement, { className?: string }>((props, ref) => {
  return (
    <ReactLenis root options={{ lerp: 0.1, duration: 1.5, smoothWheel: true }}>
      <main className={`relative w-full ${props.className || ''}`} ref={ref}>
        {/* Intro Section */}
        <div className='wrapper relative z-0'>
          <section className='h-[60vh] w-full grid place-content-center sticky top-0' style={{ background: 'var(--page-bg)' }}>
            <div className='absolute bottom-0 left-0 right-0 top-0 opacity-20 bg-[linear-gradient(to_right,#4f4f4f2e_1px,transparent_1px),linear-gradient(to_bottom,#4f4f4f2e_1px,transparent_1px)] bg-[size:54px_54px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]'></div>
            <motion.div className="text-center px-4 relative z-10" initial={{ y: 40, opacity: 0 }} whileInView={{ y: 0, opacity: 1 }} viewport={{ once: true }}>
              <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight mb-4" style={{ color: "var(--page-fg)" }}>
                Four Simple Steps.
              </h2>
              <p className="text-base sm:text-lg max-w-xl mx-auto" style={{ color: "var(--muted)" }}>
                From loan link to pre-approved offer. Scroll down to see the how it works. 👇
              </p>
            </motion.div>
          </section>
        </div>

        {/* Sticky Cards Section */}
        <section className='w-full relative z-10' style={{ background: 'var(--page-bg)' }}>
          <div className='flex flex-col md:flex-row justify-between px-6 sm:px-16 max-w-7xl mx-auto pb-40'>

            {/* Left side: Heading stays fixed while cards scroll past */}
            <div className='hidden md:grid sticky top-0 h-screen place-content-center w-1/2'>
              <h1 className='text-4xl lg:text-5xl px-8 font-bold tracking-tight leading-[120%]' style={{ color: "var(--page-fg)" }}>
                How It Works <br />
                <span style={{ color: '#2563EB' }}>Seamless Flow</span>
              </h1>
            </div>

            {/* Right side: Stacking Cards */}
            <div className='grid gap-0 md:w-1/2 mt-20 md:mt-0 relative'>
              {articleCardsData.map((card, i) => (
                <figure key={i} className='sticky top-0 h-screen relative w-full'>
                  {/* The wrapper flexbox centers the card perfectly on screen, avoiding the top navbar */}
                  <div className="absolute top-0 left-0 h-full w-full pointer-events-none flex flex-col items-center justify-center" style={{ marginTop: `${i * 20}px`, zIndex: i }}>
                    <article
                      className={`relative pointer-events-auto w-full max-w-[30rem] rounded-3xl ${card.rotation} p-8 grid place-content-center gap-4 shadow-2xl transition-transform hover:scale-[1.02] duration-300 mx-auto text-white`}
                      style={{
                        backgroundColor: card.color,
                        boxShadow: "0 -20px 40px rgba(0,0,0,0.2)"
                      }}
                    >
                      {/* Faded Background Number */}
                      <div className="absolute top-4 right-6 text-[6rem] font-black leading-none text-white/[0.05] select-none pointer-events-none" style={{ fontFamily: "var(--font-mono)" }}>
                        {card.num}
                      </div>

                      <div className="relative z-10 flex flex-col gap-6">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl shadow-inner"
                            style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)" }}>
                            {card.icon}
                          </div>
                          <div>
                            <span className="text-sm font-bold uppercase tracking-widest text-white/50">Step {card.num}</span>
                            <h1 className='text-2xl lg:text-3xl font-bold tracking-tight'>{card.title}</h1>
                          </div>
                        </div>
                        <p className="text-lg leading-relaxed text-white/90">{card.description}</p>
                      </div>
                    </article>
                  </div>
                </figure>
              ))}
            </div>

          </div>
        </section>
      </main>
    </ReactLenis>
  );
});

ScrollCard.displayName = 'ScrollCard';

export default ScrollCard;
