"use client";

type Destination = "piano" | "voice" | "ratio" | "technical";

const ROUTES: Array<{
  id: Destination;
  index: string;
  title: string;
  body: string;
  action: string;
}> = [
  {
    id: "piano",
    index: "01",
    title: "Piano",
    body: "Silent MIDI turns your playing into interval, scale, chord, notation, and motion views.",
    action: "Open Piano",
  },
  {
    id: "voice",
    index: "02",
    title: "Voice",
    body: "Hear a target, sing from memory, then see pitch direction, cents, steadiness, and harmonics.",
    action: "Open Voice",
  },
  {
    id: "ratio",
    index: "03",
    title: "Foundations",
    body: "Compare frequencies, build movable-Do scales, and inspect how physical relationships become music.",
    action: "Explore intervals",
  },
];

export function GuideLab({ onNavigate }: { onNavigate: (destination: Destination) => void }) {
  return (
    <section className="start-landing" aria-labelledby="start-title">
      <div className="start-landing-main">
        <div className="start-landing-copy">
          <p className="section-kicker">Ear-first music companion</p>
          <h1 id="start-title">Hear the relationship. See it. Find it with your hands or voice.</h1>
          <p>Music With No Names links pitch, timing, intervals, scales, chords, notation, and physical keys without treating note names as the foundation.</p>
          <div className="start-landing-actions">
            <button type="button" onClick={() => onNavigate("piano")}>Open Piano HUD <span aria-hidden="true">→</span></button>
            <button type="button" onClick={() => onNavigate("voice")}>Train with Voice</button>
          </div>
          <button className="start-technical-link" type="button" onClick={() => onNavigate("technical")}>How the measurements work <span aria-hidden="true">→</span> Technical Notes</button>
        </div>

        <div className="start-relationship-map" role="img" aria-label="A sounding gesture becomes interval and timing evidence, gains musical context, and remains open to the listener's experience">
          <div className="start-orbit is-outer" aria-hidden="true" />
          <div className="start-orbit is-middle" aria-hidden="true" />
          <div className="start-orbit is-inner" aria-hidden="true" />
          <span className="start-map-node is-sound"><i aria-hidden="true" />sound<strong>frequency · time</strong></span>
          <span className="start-map-node is-relation"><i aria-hidden="true" />relationship<strong>interval · rhythm</strong></span>
          <span className="start-map-node is-context"><i aria-hidden="true" />context<strong>scale · chord · phrase</strong></span>
          <span className="start-map-node is-listener"><i aria-hidden="true" />listener<strong>memory · purpose</strong></span>
          <b aria-hidden="true">∿</b>
        </div>
      </div>

      <nav className="start-routes" aria-label="Choose a place to begin">
        {ROUTES.map((route) => (
          <button key={route.id} type="button" onClick={() => onNavigate(route.id)}>
            <span>{route.index}</span>
            <strong>{route.title}</strong>
            <small>{route.body}</small>
            <em>{route.action} →</em>
          </button>
        ))}
      </nav>
    </section>
  );
}
