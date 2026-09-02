import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  addBetaTrade,
  combinePlayerCollection,
  createProfileExport,
  emptyState,
  getGroupFoilNames,
  parseAlbumSlug,
  parseProfileExport,
  reverseBetaTrade,
} from '../../src/collections';
import { exportGroupWorkbook } from '../../src/exportWorkbook';
import type { SyncPlayerMessage, SyncPlayerResponse } from '../../src/messages';
import { paginate } from '../../src/pagination';
import { parseLegacySave } from '../../src/saveDecoder';
import { loadState, saveState, watchState } from '../../src/storage';
import type { AppState, PlayerCollection, TradeVariant } from '../../src/types';
import './App.css';

function downloadJson(value: unknown, filename: string): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatDate(value?: string): string {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

type AppProps = { fullPage?: boolean };

function App({ fullPage = false }: AppProps) {
  const [state, setState] = useState<AppState>(emptyState());
  const [albumInput, setAlbumInput] = useState('');
  const [search, setSearch] = useState('');
  const [duplicatesOnly, setDuplicatesOnly] = useState(false);
  const [foilsOnly, setFoilsOnly] = useState(false);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState('');
  const [saveTarget, setSaveTarget] = useState<string>();
  const [tradeFrom, setTradeFrom] = useState('');
  const [tradeTo, setTradeTo] = useState('');
  const [tradeCard, setTradeCard] = useState('');
  const [tradeVariant, setTradeVariant] = useState<TradeVariant>('normal');
  const [tradeQuantity, setTradeQuantity] = useState(1);
  const [showFoilExport, setShowFoilExport] = useState(false);
  const [page, setPage] = useState(0);
  const saveInput = useRef<HTMLInputElement>(null);
  const profileInput = useRef<HTMLInputElement>(null);
  const tableWrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void loadState().then(setState);
    return watchState(setState);
  }, []);

  useEffect(() => setPage(0), [search, duplicatesOnly, foilsOnly]);

  const players = useMemo(() => Object.values(state.players), [state.players]);
  const rows = useMemo(() => {
    const byPlayer = players.map((player) => new Map(combinePlayerCollection(player, state.trades).map((card) => [card.name, card])));
    const names = new Set<string>();
    byPlayer.forEach((cards) => cards.forEach((_, name) => names.add(name)));
    const query = search.trim().toLowerCase();
    return [...names]
      .sort((a, b) => a.localeCompare(b))
      .filter((name) => !query || name.toLowerCase().includes(query))
      .filter((name) => {
        const cards = byPlayer.map((collection) => collection.get(name));
        if (duplicatesOnly && !cards.some((card) => (card?.total.normal ?? 0) > 1 || (card?.total.foil ?? 0) > 1)) return false;
        if (foilsOnly && !cards.some((card) => (card?.total.foil ?? 0) > 0)) return false;
        return true;
      })
      .map((name) => ({ name, cards: byPlayer.map((collection) => collection.get(name)) }));
  }, [players, state.trades, search, duplicatesOnly, foilsOnly]);

  const totals = useMemo(() => {
    const unique = new Set<string>();
    let copies = 0;
    let foils = 0;
    players.forEach((player) => {
      combinePlayerCollection(player, state.trades).forEach((card) => {
        unique.add(card.name);
        copies += card.total.normal + card.total.foil;
        foils += card.total.foil;
      });
    });
    return { unique: unique.size, copies, foils };
  }, [players, state.trades]);

  const foilNames = useMemo(() => getGroupFoilNames(state), [state]);
  const foilExportText = foilNames.join(', ');
  const pageSlice = paginate(rows, page);
  const { currentPage, totalPages, start: visibleStart, end: visibleEnd, items: visibleRows } = pageSlice;

  const selectedFrom = state.players[tradeFrom] ? tradeFrom : players[0]?.slug ?? '';
  const selectedTo = state.players[tradeTo] && tradeTo !== selectedFrom
    ? tradeTo
    : players.find((player) => player.slug !== selectedFrom)?.slug ?? '';
  const tradeableCards = selectedFrom
    ? combinePlayerCollection(state.players[selectedFrom]!, state.trades).filter((card) => card.beta.normal + card.beta.foil > 0)
    : [];
  const selectedTradeCard = tradeableCards.find((card) => card.name.toLocaleLowerCase() === tradeCard.trim().toLocaleLowerCase());
  const availableToTrade = selectedTradeCard?.beta[tradeVariant] ?? 0;

  async function syncPlayer(slug: string): Promise<void> {
    setSyncing((current) => ({ ...current, [slug]: true }));
    const response = (await browser.runtime.sendMessage({ type: 'SYNC_PLAYER', slug } satisfies SyncPlayerMessage)) as SyncPlayerResponse;
    setSyncing((current) => ({ ...current, [slug]: false }));
    setNotice(response.ok ? `${slug} synced.` : response.error);
  }

  async function addPlayer(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      const slug = parseAlbumSlug(albumInput);
      setAlbumInput('');
      await syncPlayer(slug);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to add player.');
    }
  }

  async function updateState(next: AppState): Promise<void> {
    setState(next);
    await saveState(next);
  }

  async function openFullScreen(): Promise<void> {
    await browser.tabs.create({ url: browser.runtime.getURL('/dashboard.html') });
  }

  async function copyFoilList(): Promise<void> {
    try {
      await navigator.clipboard.writeText(foilExportText);
      setNotice(`Copied ${foilNames.length.toLocaleString()} unique foil card names.`);
    } catch {
      setNotice('Chrome could not copy the list automatically. Select the text and press Ctrl+C.');
    }
  }

  function changePage(nextPage: number): void {
    setPage(Math.max(0, Math.min(nextPage, totalPages - 1)));
    tableWrap.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function recordTrade(event: FormEvent): Promise<void> {
    event.preventDefault();
    try {
      const next = addBetaTrade(state, {
        cardName: tradeCard,
        fromSlug: selectedFrom,
        toSlug: selectedTo,
        variant: tradeVariant,
        quantity: tradeQuantity,
      });
      await updateState(next);
      setTradeCard('');
      setTradeQuantity(1);
      setNotice('Beta card movement recorded.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to record this trade.');
    }
  }

  async function undoTrade(tradeId: string): Promise<void> {
    try {
      await updateState(reverseBetaTrade(state, tradeId));
      setNotice('Trade reversed and collection totals restored.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to reverse this trade.');
    }
  }

  function chooseSave(slug: string): void {
    setSaveTarget(slug);
    saveInput.current?.click();
  }

  async function importSave(file?: File): Promise<void> {
    if (!file || !saveTarget) return;
    try {
      const legacy = await parseLegacySave(await file.text());
      const next = structuredClone(state);
      const player = next.players[saveTarget];
      if (!player) throw new Error('The selected player is no longer in the group.');
      player.legacy = legacy;
      await updateState(next);
      setNotice(`Imported ${legacy.totalCopies.toLocaleString()} beta copies for ${player.displayName}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to import save.');
    } finally {
      if (saveInput.current) saveInput.current.value = '';
    }
  }

  async function importProfiles(files: FileList | null): Promise<void> {
    if (!files?.length) return;
    try {
      const next = structuredClone(state);
      const slugs: string[] = [];
      for (const file of Array.from(files)) {
        const profile = parseProfileExport(JSON.parse(await file.text()));
        const existing = next.players[profile.slug];
        next.players[profile.slug] = {
          slug: profile.slug,
          displayName: profile.displayName,
          albumUrl: `https://osrs-tcg.net/album/${profile.slug}`,
          website: existing?.website,
          legacy: profile.legacy ?? existing?.legacy,
        };
        slugs.push(profile.slug);
      }
      await updateState(next);
      for (const slug of slugs) void syncPlayer(slug);
      setNotice(`Imported ${slugs.length} player profile${slugs.length === 1 ? '' : 's'}.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to import player profiles.');
    } finally {
      if (profileInput.current) profileInput.current.value = '';
    }
  }

  async function removePlayer(player: PlayerCollection): Promise<void> {
    if (!window.confirm(`Remove ${player.displayName} from this group?`)) return;
    const next = structuredClone(state);
    delete next.players[player.slug];
    await updateState(next);
  }

  return (
    <main className={`app-shell${fullPage ? ' full-page' : ''}`}>
      <header className="hero">
        <div className="brand-mark">TCG</div>
        <div className="hero-copy">
          <p className="eyebrow">OSRS COLLECTION TOOLS</p>
          <h1>Group album</h1>
          <p className="subtitle">Live cards, complete beta saves, and useful duplicates in one place.</p>
        </div>
        {!fullPage && <button className="open-full" onClick={() => void openFullScreen()}>Open full screen ↗</button>}
      </header>

      <section className="stats-grid" aria-label="Group totals">
        <div><span>Players</span><strong>{players.length}</strong></div>
        <div><span>Unique cards</span><strong>{totals.unique.toLocaleString()}</strong></div>
        <div><span>Total copies</span><strong>{totals.copies.toLocaleString()}</strong></div>
        <div className="foil-stat">
          <div className="stat-label-row">
            <span>Foils</span>
            <button
              className="stat-export"
              onClick={() => setShowFoilExport((visible) => !visible)}
              disabled={foilNames.length === 0}
            >
              Export
            </button>
          </div>
          <strong className="foil-text">{totals.foils.toLocaleString()}</strong>
        </div>
      </section>

      {showFoilExport && (
        <section className="panel foil-export-panel">
          <div className="foil-export-header">
            <div>
              <h2>Group foil list</h2>
              <p>{foilNames.length.toLocaleString()} unique foil cards, alphabetically sorted.</p>
            </div>
            <button className="primary" onClick={() => void copyFoilList()}>Copy list</button>
          </div>
          <textarea readOnly value={foilExportText} aria-label="Comma-separated foil card names" />
        </section>
      )}

      <section className="panel add-panel">
        <div>
          <h2>Add a public album</h2>
          <p>Paste an album URL or enter its player slug. Every page is fetched automatically.</p>
        </div>
        <form onSubmit={(event) => void addPlayer(event)}>
          <input
            value={albumInput}
            onChange={(event) => setAlbumInput(event.target.value)}
            placeholder="osrs-tcg.net/album/playername"
            aria-label="Album URL or player name"
          />
          <button className="primary" type="submit">Add & sync</button>
        </form>
      </section>

      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')} aria-label="Dismiss">×</button></div>}

      <section className="section-heading">
        <div><p className="eyebrow">YOUR GROUP</p><h2>Players</h2></div>
        <div className="header-actions">
          <button onClick={() => profileInput.current?.click()}>Import profiles</button>
          <button onClick={() => players.forEach((player) => void syncPlayer(player.slug))} disabled={!players.length}>Sync all</button>
        </div>
      </section>

      <div className="player-list">
        {players.length === 0 && <div className="empty-state">Add the first album to start the group comparison.</div>}
        {players.map((player) => {
          const effectiveCards = combinePlayerCollection(player, state.trades);
          const effectiveBeta = effectiveCards.reduce(
            (total, card) => ({
              copies: total.copies + card.beta.normal + card.beta.foil,
              foils: total.foils + card.beta.foil,
            }),
            { copies: 0, foils: 0 },
          );
          const current = player.website?.current;
          return (
            <article className="player-card" key={player.slug}>
              <div className="player-topline">
                <div>
                  <h3>{player.displayName}</h3>
                  <a href={player.albumUrl} target="_blank" rel="noreferrer">@{player.slug}</a>
                </div>
                <span className={player.lastError ? 'status error' : player.website ? 'status live' : 'status'}>
                  {player.lastError ? 'Sync error' : player.website ? 'Live' : 'Not synced'}
                </span>
              </div>
              <div className="source-row">
                <div><span>Current</span><strong>{current?.totalCopies.toLocaleString() ?? '—'}</strong></div>
                <div><span>Beta</span><strong>{effectiveBeta.copies.toLocaleString()}</strong></div>
                <div><span>Foils</span><strong>{((current?.foilCopies ?? 0) + effectiveBeta.foils).toLocaleString()}</strong></div>
              </div>
              <p className="source-note">
                Beta source: <b>{player.legacy ? 'full .save file' : player.website ? 'public album fallback' : 'not loaded'}</b>
                {player.website && <> · synced {formatDate(player.website.capturedAt)}</>}
              </p>
              {player.lastError && <p className="error-copy">{player.lastError}</p>}
              <div className="card-actions">
                <button onClick={() => void syncPlayer(player.slug)} disabled={syncing[player.slug]}>
                  {syncing[player.slug] ? 'Syncing pages…' : 'Sync live cards'}
                </button>
                <button onClick={() => chooseSave(player.slug)}>Import beta save</button>
                <button onClick={() => downloadJson(createProfileExport(player), `${player.slug}-tcg-profile.json`)}>Export profile</button>
                <button className="danger" onClick={() => void removePlayer(player)}>Remove</button>
              </div>
            </article>
          );
        })}
      </div>

      <section className="section-heading trade-heading">
        <div><p className="eyebrow">MANUAL MOVEMENT</p><h2>Beta trades</h2></div>
        <span className="trade-count">{state.trades.filter((trade) => !trade.reversedAt).length} active trades</span>
      </section>

      <section className="panel trade-panel">
        <form className="trade-form" onSubmit={(event) => void recordTrade(event)}>
          <label>
            <span>From</span>
            <select value={selectedFrom} onChange={(event) => { setTradeFrom(event.target.value); setTradeCard(''); }} disabled={players.length < 2}>
              {players.map((player) => <option value={player.slug} key={player.slug}>{player.displayName}</option>)}
            </select>
          </label>
          <label>
            <span>To</span>
            <select value={selectedTo} onChange={(event) => setTradeTo(event.target.value)} disabled={players.length < 2}>
              {players.filter((player) => player.slug !== selectedFrom).map((player) => (
                <option value={player.slug} key={player.slug}>{player.displayName}</option>
              ))}
            </select>
          </label>
          <label className="trade-card-field">
            <span>Beta card</span>
            <input
              list="tradeable-beta-cards"
              value={tradeCard}
              onChange={(event) => setTradeCard(event.target.value)}
              placeholder="Start typing a card name…"
              disabled={!selectedFrom}
            />
            <datalist id="tradeable-beta-cards">
              {tradeableCards.map((card) => <option value={card.name} key={card.name} />)}
            </datalist>
          </label>
          <label>
            <span>Variant</span>
            <select value={tradeVariant} onChange={(event) => setTradeVariant(event.target.value as TradeVariant)}>
              <option value="normal">Normal beta</option>
              <option value="foil">Foil beta</option>
            </select>
          </label>
          <label>
            <span>Quantity</span>
            <input type="number" min="1" max={Math.max(1, availableToTrade)} value={tradeQuantity} onChange={(event) => setTradeQuantity(Number(event.target.value))} />
          </label>
          <button className="primary record-trade" type="submit" disabled={players.length < 2 || !selectedTradeCard || availableToTrade < tradeQuantity}>
            Record trade
          </button>
        </form>
        <p className="availability">
          {selectedTradeCard
            ? `${availableToTrade} ${tradeVariant} beta cop${availableToTrade === 1 ? 'y' : 'ies'} available from ${state.players[selectedFrom]?.displayName}.`
            : players.length < 2
              ? 'Add at least two players before recording a trade.'
              : 'Choose a card owned by the sending player.'}
        </p>

        {state.trades.length > 0 && (
          <div className="trade-history">
            {[...state.trades].reverse().map((trade) => {
              const from = state.players[trade.fromSlug]?.displayName ?? trade.fromSlug;
              const to = state.players[trade.toSlug]?.displayName ?? trade.toSlug;
              return (
                <div className={`trade-row${trade.reversedAt ? ' reversed' : ''}`} key={trade.id}>
                  <span className={`variant-token ${trade.variant}`}>{trade.variant === 'foil' ? '★ Foil beta' : 'Beta'}</span>
                  <div className="trade-description">
                    <strong>{trade.quantity}× {trade.cardName}</strong>
                    <span>{from} → {to} · {formatDate(trade.createdAt)}</span>
                  </div>
                  {trade.reversedAt
                    ? <span className="reversed-label">Reversed</span>
                    : <button onClick={() => void undoTrade(trade.id)}>Reverse</button>}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="section-heading collection-heading">
        <div><p className="eyebrow">COMPARISON</p><h2>Group collection</h2></div>
        <button
          className="primary"
          onClick={() => void exportGroupWorkbook(state).catch((error: Error) => setNotice(error.message))}
          disabled={!players.length}
        >
          Export Excel
        </button>
      </section>

      <section className="panel filters">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search cards…" aria-label="Search cards" />
        <label><input type="checkbox" checked={duplicatesOnly} onChange={(event) => setDuplicatesOnly(event.target.checked)} /> Duplicates only</label>
        <label><input type="checkbox" checked={foilsOnly} onChange={(event) => setFoilsOnly(event.target.checked)} /> Foils only</label>
        <span>{rows.length.toLocaleString()} cards</span>
      </section>

      <div className="table-wrap" ref={tableWrap}>
        <table>
          <thead><tr><th>Card</th>{players.map((player) => <th key={player.slug}>{player.displayName}</th>)}</tr></thead>
          <tbody>
            {visibleRows.map((row) => (
              <tr key={row.name}>
                <td>
                  {row.name}
                  {state.trades.some((trade) => !trade.reversedAt && trade.cardName === row.name) && <span className="traded-pill">Moved</span>}
                </td>
                {row.cards.map((card, index) => {
                  const normal = card?.total.normal ?? 0;
                  const foil = card?.total.foil ?? 0;
                  const duplicate = normal > 1 || foil > 1;
                  return <td className={!normal && !foil ? 'missing' : duplicate ? 'duplicate' : ''} key={players[index]!.slug}>
                    {normal || foil ? <><b>{normal}</b>{foil > 0 && <span className="foil-pill">★ {foil}</span>}</> : '—'}
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="table-pagination">
        <span>Showing {visibleStart.toLocaleString()}–{visibleEnd.toLocaleString()} of {rows.length.toLocaleString()} cards</span>
        <div>
          <button onClick={() => changePage(currentPage - 1)} disabled={currentPage === 0}>← Previous</button>
          <span>Page {currentPage + 1} of {totalPages}</span>
          <button onClick={() => changePage(currentPage + 1)} disabled={currentPage >= totalPages - 1}>Next →</button>
        </div>
      </div>

      <input ref={saveInput} className="hidden-input" type="file" accept=".save,.txt" onChange={(event) => void importSave(event.target.files?.[0])} />
      <input ref={profileInput} className="hidden-input" type="file" accept=".json" multiple onChange={(event) => void importProfiles(event.target.files)} />
    </main>
  );
}

export default App;
