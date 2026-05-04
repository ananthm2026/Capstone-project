import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/**
 * TopHeader — Reusable page header component for consistent layout.
 * Features:
 * - Optional back button
 * - Page title (required)
 * - Optional subtitle
 * - Optional right-side controls area
 * - Fixed styling using design tokens
 */
export default function TopHeader({
  title,
  subtitle = null,
  onBack = null,
  rightControls = null,
  backTo = null,
}) {
  const navigate = useNavigate();

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (backTo) {
      navigate(backTo);
    } else {
      navigate(-1);
    }
  };

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}
    >
      {/* Back button */}
      {onBack !== false && backTo !== false && (
        <button
          onClick={handleBack}
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: 'var(--surface)',
            border: '1px solid var(--border-warm)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            color: 'var(--text-ink)',
            transition: 'all 0.15s ease',
          }}
          onMouseEnter={(e) => {
            e.target.style.background = 'var(--surface-tinted)';
            e.target.style.borderColor = 'var(--saffron)';
          }}
          onMouseLeave={(e) => {
            e.target.style.background = 'var(--surface)';
            e.target.style.borderColor = 'var(--border-warm)';
          }}
        >
          <ChevronLeft size={18} />
        </button>
      )}

      {/* Title and subtitle */}
      <div style={{ flex: 1 }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.5rem',
            fontWeight: 600,
            color: 'var(--text-ink)',
            margin: 0,
          }}
        >
          {title}
        </h2>
        {subtitle && (
          <p
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: '0.875rem',
              color: 'var(--text-warm)',
              margin: '4px 0 0 0',
            }}
          >
            {subtitle}
          </p>
        )}
      </div>

      {/* Right-side controls */}
      {rightControls && <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{rightControls}</div>}
    </div>
  );
}
