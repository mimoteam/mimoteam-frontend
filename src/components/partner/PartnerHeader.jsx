export default function PartnerHeader(props) {
  return (
    <header className="pm-header">
      <div className="pm-header__title">
        <h1>Lightning Lanes</h1>
        <p className="pm-header__subtitle">Welcome — <span>GUIDE</span></p>
      </div>

      <button className="pm-header__menu" aria-label="Menu">
        <span className="pm-kebab" />
      </button>
    </header>
  );
}
