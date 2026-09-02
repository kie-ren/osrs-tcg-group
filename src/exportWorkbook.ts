import ExcelJS from 'exceljs';
import { combinePlayerCollection } from './collections';
import type { AppState } from './types';

const NAVY = 'FF17243B';
const BLUE = 'FF2563EB';
const PALE_BLUE = 'FFE8F0FF';
const YELLOW = 'FFFFE49A';
const GREEN = 'FFCDEFD9';
const GREY = 'FFF1F3F5';
const WHITE = 'FFFFFFFF';

function solid(argb: string): ExcelJS.Fill {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function createGroupWorkbook(state: AppState): Promise<ExcelJS.Workbook> {
  const players = Object.values(state.players);
  if (players.length === 0) throw new Error('Add at least one player before exporting Excel.');

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'OSRS TCG Group Collection';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Group Collection', {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 2 }],
  });

  const cardsByPlayer = players.map((player) => new Map(combinePlayerCollection(player, state.trades).map((card) => [card.name, card])));
  const cardNames = new Set<string>();
  for (const cards of cardsByPlayer) for (const name of cards.keys()) cardNames.add(name);
  const sortedNames = [...cardNames].sort((a, b) => a.localeCompare(b));

  const topHeader = sheet.addRow(['Card']);
  const metricHeader = sheet.addRow(['']);
  let column = 2;
  players.forEach((player) => {
    topHeader.getCell(column).value = player.displayName;
    sheet.mergeCells(1, column, 1, column + 3);
    ['Normal', 'Normal dupes', 'Foils', 'Foil dupes'].forEach((label, index) => {
      metricHeader.getCell(column + index).value = label;
    });
    column += 4;
  });
  topHeader.getCell(column).value = 'Team';
  sheet.mergeCells(1, column, 1, column + 1);
  metricHeader.getCell(column).value = 'Copies';
  metricHeader.getCell(column + 1).value = 'Foils';
  sheet.mergeCells('A1:A2');

  for (const row of [topHeader, metricHeader]) {
    row.font = { bold: true, color: { argb: WHITE } };
    row.fill = solid(NAVY);
    row.alignment = { vertical: 'middle', horizontal: 'center' };
  }
  topHeader.height = 24;
  metricHeader.height = 34;

  for (const name of sortedNames) {
    const values: (string | number)[] = [name];
    let teamCopies = 0;
    let teamFoils = 0;
    cardsByPlayer.forEach((cards) => {
      const counts = cards.get(name)?.total ?? { normal: 0, foil: 0 };
      values.push(counts.normal, Math.max(0, counts.normal - 1), counts.foil, Math.max(0, counts.foil - 1));
      teamCopies += counts.normal + counts.foil;
      teamFoils += counts.foil;
    });
    values.push(teamCopies, teamFoils);
    const row = sheet.addRow(values);

    players.forEach((_, playerIndex) => {
      const start = 2 + playerIndex * 4;
      const normal = Number(row.getCell(start).value);
      const normalDupes = Number(row.getCell(start + 1).value);
      const foils = Number(row.getCell(start + 2).value);
      const foilDupes = Number(row.getCell(start + 3).value);
      if (normal + foils === 0) {
        for (let offset = 0; offset < 4; offset += 1) row.getCell(start + offset).fill = solid(GREY);
      }
      if (normalDupes > 0) row.getCell(start + 1).fill = solid(YELLOW);
      if (foils > 0) row.getCell(start + 2).fill = solid(GREEN);
      if (foilDupes > 0) row.getCell(start + 3).fill = solid(GREEN);
    });
  }

  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: sheet.columnCount } };
  sheet.getColumn(1).width = 42;
  for (let index = 2; index <= sheet.columnCount; index += 1) sheet.getColumn(index).width = 13;
  sheet.eachRow({ includeEmpty: true }, (row) => {
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        bottom: { style: 'hair', color: { argb: 'FFD7DCE3' } },
        right: { style: 'hair', color: { argb: 'FFE3E7EC' } },
      };
    });
  });

  const sources = workbook.addWorksheet('Sources', { views: [{ state: 'frozen', ySplit: 1 }] });
  sources.addRow([
    'Player', 'Beta source', 'Source beta copies', 'Beta copies after trades',
    'Beta foils after trades', 'Current copies', 'Current foils', 'Last website sync',
  ]);
  players.forEach((player) => {
    const beta = player.website?.beta ?? player.legacy;
    const effectiveBeta = combinePlayerCollection(player, state.trades).reduce(
      (total, card) => ({
        copies: total.copies + card.beta.normal + card.beta.foil,
        foils: total.foils + card.beta.foil,
      }),
      { copies: 0, foils: 0 },
    );
    sources.addRow([
      player.displayName,
      player.website ? 'Public album' : player.legacy ? 'Imported save fallback' : 'Unavailable',
      beta?.totalCopies ?? 0,
      effectiveBeta.copies,
      effectiveBeta.foils,
      player.website?.current.totalCopies ?? 0,
      player.website?.current.foilCopies ?? 0,
      player.website?.capturedAt ? new Date(player.website.capturedAt) : '',
    ]);
  });
  sources.getRow(1).font = { bold: true, color: { argb: WHITE } };
  sources.getRow(1).fill = solid(BLUE);
  sources.columns.forEach((sourceColumn, index) => {
    sourceColumn.width = index === 0 ? 24 : 22;
  });
  sources.getColumn(8).numFmt = 'dd mmm yyyy hh:mm';
  sources.eachRow((row, rowNumber) => {
    if (rowNumber > 1 && rowNumber % 2 === 0) row.fill = solid(PALE_BLUE);
  });

  const history = workbook.addWorksheet('Trade History', { views: [{ state: 'frozen', ySplit: 1 }] });
  history.addRow(['Date', 'Card', 'Variant', 'Quantity', 'From', 'To', 'Status', 'Reversed']);
  const playerNames = new Map(players.map((player) => [player.slug, player.displayName]));
  [...state.trades].reverse().forEach((trade) => {
    history.addRow([
      new Date(trade.createdAt),
      trade.cardName,
      trade.variant === 'foil' ? 'Foil beta' : 'Normal beta',
      trade.quantity,
      playerNames.get(trade.fromSlug) ?? trade.fromSlug,
      playerNames.get(trade.toSlug) ?? trade.toSlug,
      trade.reversedAt ? 'Reversed' : 'Active',
      trade.reversedAt ? new Date(trade.reversedAt) : '',
    ]);
  });
  history.getRow(1).font = { bold: true, color: { argb: WHITE } };
  history.getRow(1).fill = solid(NAVY);
  history.getColumn(1).numFmt = 'dd mmm yyyy hh:mm';
  history.getColumn(8).numFmt = 'dd mmm yyyy hh:mm';
  history.columns.forEach((historyColumn, index) => {
    historyColumn.width = index === 1 ? 38 : index === 0 || index === 7 ? 22 : 16;
  });

  return workbook;
}

export async function exportGroupWorkbook(state: AppState): Promise<void> {
  const workbook = await createGroupWorkbook(state);
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer as BlobPart], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    `osrs-tcg-group-${new Date().toISOString().slice(0, 10)}.xlsx`,
  );
}
