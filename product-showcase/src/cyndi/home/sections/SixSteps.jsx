import Section from '../components/Section.jsx'
import { steps } from '../content.js'

// Hand-drawn line icons matching the reference flow. Accent color = deep oat.
const LINE = '#1c1917'
const ACC = '#8C7B66'

function StepIcon({ n }) {
  const base = {
    viewBox: '0 0 100 100', fill: 'none', stroke: LINE,
    strokeWidth: 2.6, strokeLinecap: 'round', strokeLinejoin: 'round',
  }
  if (n === 1) return (
    <svg {...base}>
      <rect x="18" y="22" width="48" height="64" rx="6" />
      <path d="M38 22 v-5 a4 4 0 0 1 4-4 h8 a4 4 0 0 1 4 4 v5" />
      <path d="M28 44 h28 M28 56 h28 M28 68 h18" />
      <path d="M63 34 l3-3" stroke={ACC} />
      <path d="M67 27 l12-12 a4.5 4.5 0 0 1 6 6 l-12 12 -8 2 z" stroke={ACC} />
      <circle cx="52" cy="78" r="6" fill={ACC} stroke="none" />
      <path d="M49.5 78 l2 2 3.5-4" stroke="#fff" strokeWidth="2" />
    </svg>
  )
  if (n === 2) return (
    <svg {...base}>
      <rect x="14" y="24" width="72" height="58" rx="6" />
      <path d="M14 40 h72" />
      <circle cx="24" cy="32" r="2" fill={ACC} stroke="none" />
      <circle cx="32" cy="32" r="2" fill={ACC} stroke="none" />
      <rect x="22" y="48" width="25" height="26" rx="2" />
      <path d="M27 66 l5-10 5 10 M28.5 61 h7" />
      <rect x="53" y="48" width="25" height="26" rx="2" />
      <path d="M59 56 h13 v8 a6.5 6.5 0 0 1-13 0 z" />
      <path d="M72 58 h3 a3 3 0 0 1 0 6 h-3" />
    </svg>
  )
  if (n === 3) return (
    <svg {...base}>
      <rect x="20" y="18" width="44" height="64" rx="5" />
      <path d="M32 34 h22 M32 48 h22 M32 62 h14" />
      <path d="M25 32 l3 3 5-6" stroke={ACC} strokeWidth="3" />
      <path d="M25 46 l3 3 5-6" stroke={ACC} strokeWidth="3" />
      <circle cx="70" cy="66" r="17" fill={ACC} stroke="none" />
      <path d="M62 66 l5 5 11-12" stroke="#fff" strokeWidth="3.4" />
    </svg>
  )
  if (n === 4) return (
    <svg {...base}>
      <rect x="18" y="20" width="50" height="60" rx="5" />
      <path d="M38 36 l-8 5 -5 8 7 4 v17 h24 v-17 l7-4 -5-8 -8-5 a7 7 0 0 1-12 0 z" />
      <circle cx="43" cy="52" r="4" fill={ACC} stroke="none" />
      <path d="M70 66 l4-4" stroke={ACC} />
      <path d="M75 58 l9-9 a4 4 0 0 1 6 6 l-9 9 -7 1 z" stroke={ACC} />
    </svg>
  )
  if (n === 5) return (
    <svg {...base}>
      <rect x="28" y="16" width="44" height="58" rx="5" />
      <path d="M38 32 h24 M38 44 h24 M38 56 h14" />
      <circle cx="64" cy="70" r="20" fill={ACC} stroke="none" />
      <circle cx="64" cy="70" r="15" fill="none" stroke="#fff" strokeWidth="1.6" />
      <path d="M56 70 l5 5 11-12" stroke="#fff" strokeWidth="3.4" />
      <path d="M40 82 h20" />
    </svg>
  )
  return (
    <svg {...base}>
      <path d="M26 46 l24-12 24 12 v30 l-24 12 -24-12 z" />
      <path d="M26 46 l24 12 24-12 M50 58 v30" />
      <path d="M38 40 l24-12 12 6" stroke={ACC} />
      <path d="M70 24 l3 3 6-7" stroke={ACC} strokeWidth="3" />
      <path d="M74 40 h10 v10 H66 v-10 z" stroke={ACC} />
      <circle cx="70" cy="52" r="2" fill={ACC} stroke="none" />
      <circle cx="80" cy="52" r="2" fill={ACC} stroke="none" />
    </svg>
  )
}

function FlowStep({ s }) {
  return (
    <div className="relative z-10 flex flex-col items-center text-center px-1">
      <div className="flex h-[88px] w-[88px] items-end justify-center md:h-[104px] md:w-auto">
        <div className="h-[76px] w-[76px] md:h-[88px] md:w-[88px]"><StepIcon n={s.n} /></div>
      </div>
      <div className="mt-3 text-[9.5px] font-bold uppercase tracking-[.14em] text-oat md:mt-4">
        {s.side === 'client' ? 'You' : 'Cyndi Global'}
      </div>
      <div className="text-[44px] font-extrabold leading-none text-oat md:text-[46px]">{s.n}</div>
      <h3 className="mt-3 text-sm font-bold leading-tight text-ink md:mt-3 md:text-[14.5px]">{s.title}</h3>
      <p className="mt-1.5 text-[11px] leading-[1.55] text-secondary/80 md:text-[11.5px]">{s.text}</p>
      <div className="mt-2 flex h-7 items-start justify-center">
        {s.gate && <span className="whitespace-nowrap rounded-full border border-oat/50 px-2.5 py-1 text-[9.5px] text-[#6b5c48]">{s.gate}</span>}
      </div>
    </div>
  )
}

export default function SixSteps() {
  return (
    <Section id="how" tone="oat" title="From brief to delivery in six steps" intro="Every order follows the same locked sequence, with two approval gates, so nothing ships that you have not signed off.">
      <div className="relative">
        <svg className="pointer-events-none absolute left-0 right-0 top-7 hidden h-24 w-full md:block" viewBox="0 0 1120 96" preserveAspectRatio="none" aria-hidden="true">
          <path d="M 88 52 Q 180 30 272 52 T 456 52 T 640 52 T 824 52 T 1008 52"
            fill="none" stroke="#8C7B66" strokeOpacity=".75" strokeWidth="2" strokeDasharray="1 9" strokeLinecap="round" />
          <g fill="#8C7B66">
            <circle cx="88" cy="52" r="3" /><circle cx="272" cy="52" r="3" />
            <circle cx="456" cy="52" r="3" /><circle cx="640" cy="52" r="3" />
            <circle cx="824" cy="52" r="3" /><circle cx="1008" cy="52" r="3" />
          </g>
        </svg>
        <div className="grid grid-cols-2 gap-y-10 sm:grid-cols-3 md:grid-cols-6 md:gap-y-0">
          {steps.map((s) => <FlowStep key={s.n} s={s} />)}
        </div>
      </div>
      <div className="mt-10 flex flex-col gap-3 border-t border-[#d8cfc0] pt-5 text-[12px] text-secondary/80 md:flex-row">
        <div className="md:flex-1 md:border-l-0 md:pl-0"><b className="font-bold text-[#6b5c48]">YOU</b> — 3 decisions &amp; 2 approval gates</div>
        <div className="md:flex-1 md:border-l-2 md:border-[#bcae97] md:pl-5"><b className="font-bold text-[#6b5c48]">CYNDI GLOBAL</b> — 3 delivery steps</div>
        <div className="md:flex-1 md:border-l-2 md:border-[#bcae97] md:pl-5">Dotted path shows the flow →</div>
      </div>
    </Section>
  )
}
