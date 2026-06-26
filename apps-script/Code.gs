/**
 * Close-Pro — synchro Google Sheet -> app (push temps reel).
 *
 * A coller dans le Google Sheet : Extensions > Apps Script.
 * Renseigner INGEST_URL, INGEST_SECRET, PAYS ci-dessous.
 * Puis : Declencheurs > Ajouter > "onChange" (ou time-driven, chaque minute)
 *        -> fonction pushNouvellesCommandes.
 *
 * pushBackfill() : a lancer UNE fois a la main pour importer l'historique
 * existant en archive (sans declencher les compteurs 10 min).
 */

var INGEST_URL = 'https://VOTRE-APP.vercel.app/api/ingest';
var INGEST_SECRET = 'METTRE_LE_MEME_SECRET_QUE_VERCEL';
var PAYS = 'CM'; // CM | CI | SN — un script par pays/sheet
var FEUILLE = 'orders';

function _rows(startRow) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEUILLE);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var out = [];
  for (var i = Math.max(1, startRow); i < values.length; i++) {
    var row = {};
    var vide = true;
    for (var c = 0; c < headers.length; c++) {
      var key = String(headers[c]).trim();
      if (!key) continue;
      row[key] = values[i][c];
      if (values[i][c] !== '' && values[i][c] != null) vide = false;
    }
    if (!vide) out.push(row);
  }
  return { rows: out, lastRow: values.length - 1 };
}

function _post(rows, backfill) {
  if (!rows.length) return;
  UrlFetchApp.fetch(INGEST_URL, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({ secret: INGEST_SECRET, pays: PAYS, backfill: backfill ? '1' : '0', rows: rows }),
  });
}

/** Pousse uniquement les nouvelles lignes depuis le dernier passage. */
function pushNouvellesCommandes() {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('lastRow') || '1');
  var data = _rows(last);
  if (data.rows.length) {
    _post(data.rows, false);
    props.setProperty('lastRow', String(data.lastRow));
  }
}

/** Import unique de tout l'historique en archive (aucun compteur arme). */
function pushBackfill() {
  var data = _rows(1);
  // envoi par paquets de 200 pour ne pas depasser les quotas
  for (var i = 0; i < data.rows.length; i += 200) {
    _post(data.rows.slice(i, i + 200), true);
  }
  PropertiesService.getScriptProperties().setProperty('lastRow', String(data.lastRow));
}
