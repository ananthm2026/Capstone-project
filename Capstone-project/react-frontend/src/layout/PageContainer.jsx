/**
 * PageContainer — Reusable content wrapper for consistent padding and max-width.
 * Provides standardized layout for all page content areas.
 * 
 * Props:
 * - children: Page content to wrap
 * - maxWidth: Optional custom max-width (default: 760px)
 * - padding: Optional custom padding (default: 24px)
 */
export default function PageContainer({
  children,
  maxWidth = '760px',
  padding = '24px',
}) {
  return (
    <div
      style={{
        width: '100%',
        maxWidth,
        margin: '0 auto',
        padding,
        background: 'var(--bg)',
      }}
    >
      {children}
    </div>
  );
}
