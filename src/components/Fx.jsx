// Lightweight CSS-only result effects (win burst, gentle rise, hearts joining).
const N = 14
export default function Fx({ kind }) {
  if (kind === 'draw') return (
    <div className="fx" aria-hidden="true"><span className="join l">💗</span><span className="join r">💗</span><span className="joined">💞</span></div>
  )
  return (
    <div className="fx" aria-hidden="true">
      {Array.from({ length: N }, (_, i) => {
        const a = (i / N) * Math.PI * 2, d = 90 + (i % 3) * 30
        const style = kind === 'win'
          ? { '--x': `${Math.cos(a) * d}px`, '--y': `${Math.sin(a) * d}px` }
          : { '--x': `${(i - N / 2) * 14}px`, animationDelay: `${i * 0.12}s` }
        return <span key={i} className={kind === 'win' ? 'burst' : 'rise'} style={style}>{['💗', '✨', '💖', '🌸'][i % 4]}</span>
      })}
    </div>
  )
}
