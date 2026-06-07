// EquipmentIcon.jsx — a distinct silhouette per equipment type.
// Stroke uses currentColor so the card can tint it by status.

export default function EquipmentIcon({ type, size = 46 }) {
  const p = { width: size, height: size, viewBox: '0 0 48 48', fill: 'none',
              stroke: 'currentColor', strokeWidth: 1.6,
              strokeLinecap: 'round', strokeLinejoin: 'round' }

  switch (type) {
    case 'FD_FAN':
    case 'ID_FAN':
    case 'PA_FAN':
      // centrifugal fan: hub + 3 curved blades in a housing
      return (
        <svg {...p}>
          <circle cx="24" cy="24" r="16" />
          <circle cx="24" cy="24" r="3.2" />
          {[0, 120, 240].map((a) => (
            <path key={a} d="M24 24 q7 -4 9 -11"
              transform={`rotate(${a} 24 24)`} />
          ))}
          <path d="M40 24 h5 v6" />
        </svg>
      )
    case 'MILL':
      // coal mill: drum / cylinder
      return (
        <svg {...p}>
          <ellipse cx="24" cy="13" rx="14" ry="5" />
          <path d="M10 13 v22 a14 5 0 0 0 28 0 v-22" />
          <ellipse cx="24" cy="35" rx="14" ry="5" opacity="0.5" />
          <line x1="24" y1="8" x2="24" y2="2" />
        </svg>
      )
    case 'BFP':
    case 'CW_PUMP':
    case 'CEP':
      // pump: volute (spiral) casing with discharge + shaft
      return (
        <svg {...p}>
          <circle cx="21" cy="26" r="13" />
          <path d="M21 26 q0 -7 7 -7 q7 0 7 7" />
          <path d="M34 19 h8 v-7" />
          <line x1="8" y1="26" x2="2" y2="26" />
          <circle cx="21" cy="26" r="2.5" />
        </svg>
      )
    case 'TURBINE':
      // steam turbine: tapered casing with internal blade rows
      return (
        <svg {...p}>
          <path d="M6 16 L42 10 L42 38 L6 32 Z" />
          {[14, 21, 28, 35].map((x) => (
            <line key={x} x1={x} y1={13 - (x - 6) * 0.16 + 2} x2={x} y2={35 - (x - 6) * 0.16 - 2} />
          ))}
          <line x1="2" y1="24" x2="6" y2="24" />
          <line x1="42" y1="24" x2="46" y2="24" />
        </svg>
      )
    case 'GENERATOR':
      // generator: cylinder with a "G"
      return (
        <svg {...p}>
          <rect x="7" y="14" width="34" height="20" rx="4" />
          <path d="M27 20 a5 5 0 1 0 0 8 h2 v-3" />
          <line x1="41" y1="24" x2="46" y2="24" />
          <line x1="13" y1="34" x2="13" y2="38" />
          <line x1="35" y1="34" x2="35" y2="38" />
        </svg>
      )
    default:
      return (
        <svg {...p}><rect x="9" y="9" width="30" height="30" rx="4" /></svg>
      )
  }
}
