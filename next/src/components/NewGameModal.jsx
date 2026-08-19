import './NewGameModal.css';

export default function NewGameModal({ onConfirm, onCancel }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="modal-title">Start a new game?</h2>
        <p className="modal-body">Your current progress will be lost.</p>
        <div className="modal-actions">
          <button className="modal-btn modal-btn--fill" onClick={onConfirm}>
            Start New Game
          </button>
          <button className="modal-btn modal-btn--outline" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
