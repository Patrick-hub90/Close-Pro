/**
 * Close-Pro — synchro Google Sheet -> Supabase (DIRECT, sans Vercel).
 *
 * A coller dans le Google Sheet : Extensions > Apps Script.
 * 1) Renseigner SUPABASE_URL, SUPABASE_SERVICE_KEY, PAYS, FEUILLE ci-dessous.
 * 2) Declencheurs > Ajouter > fonction pushNouvellesCommandes,
 *    evenement "Lors de la modification" (onChange) ou minute par minute.
 *
 * L'app demarre MAINTENANT : on ne pousse QUE les nouvelles lignes.
 * On NE charge PAS l'historique (pas de backfill).
 */

var SUPABASE_URL = 'https://VOTRE-PROJET.supabase.co';
var SUPABASE_SERVICE_KEY = 'COLLER_LA_CLE_service_role'; // Project Settings > API > service_role
var PAYS = 'CM';            // CM | CI | SN — un script par pays/sheet
var FEUILLE = 'orders';     // nom de l'onglet des commandes

var INDICATIFS = { CM: { ind: '237', len: 9 }, CI: { ind: '225', len: 10 }, SN: { ind: '221', len: 9 } };

function _normPhone(raw) {
  var cfg = INDICATIFS[PAYS] || INDICATIFS.CM;
  var d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('00' + cfg.ind) === 0) d = d.slice(2);
  if (d.indexOf(cfg.ind) !== 0 && d.length === cfg.len) d = cfg.ind + d;
  return '+' + d;
}

function _get(row, headers, name) {
  for (var c = 0; c < headers.length; c++) {
    if (String(headers[c]).trim().toLowerCase() === name.toLowerCase()) {
      return row[c] === '' ? null : row[c];
    }
  }
  return null;
}

function pushNouvellesCommandes() {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('lastRow') || '1');
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEUILLE);
  var values = sh.getDataRange().getValues();
  var headers = values[0];
  var nowIso = new Date().toISOString();
  var deadlineIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  var records = [];
  for (var i = Math.max(1, last); i < values.length; i++) {
    var row = values[i];
    var numero = _get(row, headers, 'Order Number');
    if (!numero) continue;
    var known = ['Order Number','Product Name','Product Quantity','Product Price','Total Price','Full Name','Phone','* Whatsapp','Whatsapp','Address 1','City','Date','Commentaire'];
    var extra = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim();
      if (h && known.indexOf(h) === -1 && row[c] !== '') extra[h] = row[c];
    }
    records.push({
      pays: PAYS,
      numero: String(numero).trim(),
      source: 'sheet',
      produit_nom: _get(row, headers, 'Product Name'),
      quantite: Number(_get(row, headers, 'Product Quantity')) || 1,
      prix_unitaire: Math.round(Number(_get(row, headers, 'Product Price')) || 0),
      total: Math.round(Number(_get(row, headers, 'Total Price')) || 0),
      nom_complet: _get(row, headers, 'Full Name'),
      telephone: _get(row, headers, 'Phone') ? String(_get(row, headers, 'Phone')).trim() : null,
      telephone_e164: _normPhone(_get(row, headers, 'Phone')),
      whatsapp: String(_get(row, headers, '* Whatsapp') || _get(row, headers, 'Whatsapp') || '').replace(/\D/g, ''),
      adresse: _get(row, headers, 'Address 1'),
      region: _get(row, headers, 'City'), // "City" = region dans EasySell
      statut: 'a_appeler',
      is_backfill: false,
      appel_deadline: deadlineIso,
      appel_deadline_type: 'nouvelle_10min',
      dernier_commentaire: _get(row, headers, 'Commentaire'),
      date_commande: nowIso,
      extra: extra,
    });
  }

  if (!records.length) return;

  // Upsert idempotent (contrainte unique pays,numero) par paquets de 100.
  for (var k = 0; k < records.length; k += 100) {
    var batch = records.slice(k, k + 100);
    UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/orders?on_conflict=pays,numero', {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        apikey: SUPABASE_SERVICE_KEY,
        Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY,
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      payload: JSON.stringify(batch),
    });
  }
  props.setProperty('lastRow', String(values.length - 1));
}

/**
 * A executer UNE FOIS au branchement : ignore tout l'historique deja present
 * pour ne pousser QUE les commandes a venir (demarrage a blanc).
 */
function marquerDepart() {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FEUILLE);
  var n = sh.getDataRange().getValues().length - 1;
  PropertiesService.getScriptProperties().setProperty('lastRow', String(n));
}
