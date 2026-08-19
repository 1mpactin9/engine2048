import './ModeDropdown.css';

const ICONS = {
  classic: (
    <svg width="20" height="20" fill="currentColor" viewBox="0 -960 960 960">
      <path d="M200-520q-33 0-56.5-23.5T120-600v-160q0-33 23.5-56.5T200-840h160q33 0 56.5 23.5T440-760v160q0 33-23.5 56.5T360-520zm0 400q-33 0-56.5-23.5T120-200v-160q0-33 23.5-56.5T200-440h160q33 0 56.5 23.5T440-360v160q0 33-23.5 56.5T360-120zm400-400q-33 0-56.5-23.5T520-600v-160q0-33 23.5-56.5T600-840h160q33 0 56.5 23.5T840-760v160q0 33-23.5 56.5T760-520zm0 400q-33 0-56.5-23.5T520-200v-160q0-33 23.5-56.5T600-440h160q33 0 56.5 23.5T840-360v160q0 33-23.5 56.5T760-120z" />
    </svg>
  ),
  standard: (
    <svg width="20" height="20" fill="currentColor" viewBox="0 -960 960 960">
      <path d="M480-269 314-169q-11 7-23 6t-21-8-14-17.5-2-23.5l44-189-147-127q-10-9-12.5-20.5T140-571t12-18 22-9l194-17 75-178q5-12 15.5-18t21.5-6 21.5 6 15.5 18l75 178 194 17q14 2 22 9t12 18 1.5 22.5T809-528L662-401l44 189q3 13-2 23.5T690-171t-21 8-23-6z" />
    </svg>
  ),
  plus: (
    <svg width="20" height="20" fill="none" viewBox="0 0 24 24">
      <path
        fill="currentColor"
        d="M3 16h18v1.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5zm0-2-.621-7.452a.75.75 0 0 1 1.163-.686l3.756 2.503a.75.75 0 0 0 1.006-.16L11.41 4.25a.75.75 0 0 1 1.18 0l3.106 3.954a.75.75 0 0 0 1.006.16l3.756-2.503a.75.75 0 0 1 1.163.686L21 14z"
      />
    </svg>
  ),
};

const MODES = [
  { id: 'classic', label: 'Classic' },
  { id: 'standard', label: 'Standard' },
  { id: 'plus', label: 'Plus' },
];

export default function ModeDropdown({ mode, onSelect }) {
  return (
    <div className="dropdown-menu" role="menu">
      <div className="dropdown-list">
        {MODES.map((m) => {
          const selected = m.id === mode;
          const isPlus = m.id === 'plus';
          return (
            <button
              key={m.id}
              role="menuitem"
              className={`dropdown-item ${selected ? 'is-selected' : ''}`}
              onClick={() => onSelect(m.id)}
            >
              <span className={`item-icon ${isPlus && !selected ? 'item-icon--plus' : ''}`}>
                {ICONS[m.id]}
              </span>
              <span className="item-label">{m.label}</span>
            </button>
          );
        })}
      </div>
      <a
        className="dropdown-github"
        href="https://github.com"
        target="_blank"
        rel="noreferrer"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 .5C5.73.5.5 5.73.5 12c0 5.09 3.29 9.4 7.86 10.93.57.1.79-.25.79-.55 0-.27-.01-1.17-.02-2.12-3.2.7-3.87-1.36-3.87-1.36-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.79 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.24 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.42.36.78 1.07.78 2.16 0 1.56-.02 2.81-.02 3.19 0 .3.21.66.8.55A10.52 10.52 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5Z" />
        </svg>
        <span>View on GitHub</span>
      </a>
    </div>
  );
}
