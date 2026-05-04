import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function SplashScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('enter'); // 'enter' | 'tagline' | 'exit'

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('tagline'), 800);
    const t2 = setTimeout(() => setPhase('exit'), 2200);
    const t3 = setTimeout(() => navigate('/landing'), 2700);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap');

        .splash-root {
          position: fixed; inset: 0;
          background: #1a0f00;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
          z-index: 9999;
          transition: opacity 0.5s ease;
        }
        .splash-root.exit { opacity: 0; pointer-events: none; }

        .splash-logo-img {
          width: 80px;
          height: 80px;
          border-radius: 50%;
          object-fit: cover;
          opacity: 0;
          transform: scale(0.85);
          animation: splashFadeIn 0.8s ease forwards;
          margin-bottom: 18px;
          box-shadow: 0 4px 32px rgba(201,168,76,0.3);
        }

        .splash-logo {
          font-family: 'Playfair Display', serif;
          font-size: 3.2rem;
          font-weight: 700;
          color: #c9a84c;
          letter-spacing: -0.5px;
          opacity: 0;
          transform: scale(0.92);
          animation: splashFadeIn 0.8s ease forwards;
        }

        .splash-tagline {
          margin-top: 14px;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 1rem;
          color: rgba(255,255,255,0.45);
          letter-spacing: 0.04em;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.6s ease, transform 0.6s ease;
        }
        .splash-tagline.visible {
          opacity: 1;
          transform: translateY(0);
        }

        @keyframes splashFadeIn {
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>

      <div className={`splash-root${phase === 'exit' ? ' exit' : ''}`}>
        <img src="/seedlinglabs-logo.png" alt="Seedlinglabs" className="splash-logo-img" />
        <span className="splash-logo">SeedlingSpeaks</span>
        <p className={`splash-tagline${phase !== 'enter' ? ' visible' : ''}`}>
          Your voice, every language, every tone.
        </p>
      </div>
    </>
  );
}
