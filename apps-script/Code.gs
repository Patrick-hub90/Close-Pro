/**
 * Close-Pro — synchro Google Sheet -> Supabase (DIRECT, sans serveur).
 * ----------------------------------------------------------------------
 * INSTALLATION EN 3 ÉTAPES (à faire une fois par Sheet/pays) :
 *
 *   1) Dans ton Google Sheet : Extensions > Apps Script, et colle CE fichier.
 *   2) Remplis les 4 réglages ci-dessous (CONFIG) : surtout SUPABASE_SERVICE_KEY.
 *   3) En haut de l'éditeur Apps Script, choisis la fonction « installer »
 *      dans le menu déroulant, clique ▷ Exécuter, et autorise les accès.
 *
 * C'est tout. « installer » teste la connexion, crée le déclencheur
 * automatique (toutes les minutes) et ignore l'historique existant.
 * Les NOUVELLES commandes remonteront alors dans l'app toutes seules (≤ 1 min).
 *
 * Pour vérifier que ça marche : menu « Exécutions » (icône ⏱ à gauche) =
 * tu y vois chaque passage et les messages (« Push OK », erreurs, etc.).
 * ----------------------------------------------------------------------
 */

// ============================ CONFIG ============================
var SUPABASE_URL = 'https://mhbykrhuzvwvwvbqfqwn.supabase.co'; // déjà pré-rempli (ton projet)
var SUPABASE_SERVICE_KEY = 'COLLER_LA_CLE_service_role';       // Supabase > Project Settings > API > service_role (secret)
var PAYS = 'CM';   // code du pays de CE Sheet : CM | CI | SN | ... (doit exister dans l'app)
var FEUILLE = '';  // nom de l'onglet des commandes ; laisse VIDE = premier onglet
// ===============================================================
// ⚠ La clé service_role donne un accès total : garde ce Sheet/script PRIVÉ,
//    ne le partage avec personne.

var INDICATIFS = {
  CM: { ind: '237', len: 9 }, CI: { ind: '225', len: 10 }, SN: { ind: '221', len: 9 },
  BJ: { ind: '229', len: 8 }, TG: { ind: '228', len: 8 }, BF: { ind: '226', len: 8 },
  ML: { ind: '223', len: 8 }, GA: { ind: '241', len: 8 }, CG: { ind: '242', len: 9 },
};

// Synonymes de colonnes (insensible à la casse) : tolère les variantes EasySell / FR / EN.
var COLS = {
  numero:      ['Order Number', 'Order Id', 'Order #', 'Order', 'Numero', 'Numéro', 'N° commande', 'ID'],
  produit:     ['Product Name', 'Produit', 'Product', 'Article'],
  quantite:    ['Product Quantity', 'Quantity', 'Quantite', 'Quantité', 'Qte', 'Qté', 'Qty'],
  prix:        ['Product Price', 'Price', 'Prix', 'Prix unitaire'],
  total:       ['Total Price', 'Total', 'Montant', 'Montant total'],
  nom:         ['Full Name', 'Name', 'Nom', 'Customer Name', 'Nom complet', 'Client'],
  phone:       ['Phone', 'Telephone', 'Téléphone', 'Phone Number', 'Numéro', 'Tel', 'Tél'],
  whatsapp:    ['* Whatsapp', 'Whatsapp', 'WhatsApp', 'Whatsapp Number'],
  adresse:     ['Address 1', 'Address', 'Adresse', 'Address Line 1', 'Quartier'],
  region:      ['City', 'Region', 'Région', 'Ville', 'State'],
  commentaire: ['Commentaire', 'Note', 'Notes', 'Comment', 'Remarque'],
};

function _feuille() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = FEUILLE ? ss.getSheetByName(FEUILLE) : null;
  if (!sh) sh = ss.getSheets()[0];
  return sh;
}

function _normPhone(raw) {
  var cfg = INDICATIFS[PAYS] || INDICATIFS.CM;
  var d = String(raw == null ? '' : raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.indexOf('00' + cfg.ind) === 0) d = d.slice(2);
  if (d.indexOf(cfg.ind) !== 0 && d.length === cfg.len) d = cfg.ind + d;
  return '+' + d;
}

function _get(row, headers, names) {
  for (var n = 0; n < names.length; n++) {
    for (var c = 0; c < headers.length; c++) {
      if (String(headers[c]).trim().toLowerCase() === names[n].toLowerCase()) {
        return row[c] === '' ? null : row[c];
      }
    }
  }
  return null;
}

/** Cœur : pousse uniquement les lignes ajoutées depuis le dernier passage. */
function pushNouvellesCommandes() {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('lastRow') || '0'); // index (0 = en-tête) de la dernière ligne déjà traitée
  var sh = _feuille();
  if (!sh) { Logger.log('ERREUR : onglet introuvable (FEUILLE="' + FEUILLE + '").'); return; }
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return; // que l'en-tête
  var headers = values[0];
  var nowIso = new Date().toISOString();
  var deadlineIso = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  // Colonnes connues -> ne pas les recopier dans "extra".
  var knownFlat = [];
  for (var key in COLS) knownFlat = knownFlat.concat(COLS[key]);
  knownFlat.push('Date', 'Status', 'Statut');

  var records = [];
  for (var i = Math.max(1, last + 1); i < values.length; i++) {
    var row = values[i];
    var numero = _get(row, headers, COLS.numero);
    if (!numero) continue; // ligne vide / sans numéro
    var extra = {};
    for (var c = 0; c < headers.length; c++) {
      var h = String(headers[c]).trim();
      if (h && knownFlat.indexOf(h) === -1 && row[c] !== '') extra[h] = row[c];
    }
    var phone = _get(row, headers, COLS.phone);
    records.push({
      pays: PAYS,
      numero: String(numero).trim(),
      source: 'sheet',
      produit_nom: _get(row, headers, COLS.produit),
      quantite: Number(_get(row, headers, COLS.quantite)) || 1,
      prix_unitaire: Math.round(Number(_get(row, headers, COLS.prix)) || 0),
      total: Math.round(Number(_get(row, headers, COLS.total)) || 0),
      nom_complet: _get(row, headers, COLS.nom),
      telephone: phone ? String(phone).trim() : null,
      telephone_e164: _normPhone(phone),
      whatsapp: String(_get(row, headers, COLS.whatsapp) || '').replace(/\D/g, '') || null,
      adresse: _get(row, headers, COLS.adresse),
      region: _get(row, headers, COLS.region), // "City" = région dans EasySell
      statut: 'a_appeler',
      is_backfill: false,
      appel_deadline: deadlineIso,
      appel_deadline_type: 'nouvelle_10min',
      dernier_commentaire: _get(row, headers, COLS.commentaire),
      date_commande: nowIso,
      extra: extra,
    });
  }

  if (!records.length) return;

  var sent = 0;
  for (var k = 0; k < records.length; k += 100) {
    var batch = records.slice(k, k + 100);
    var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/orders?on_conflict=pays,numero', {
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
    var code = resp.getResponseCode();
    if (code >= 300) {
      Logger.log('ERREUR push Supabase (HTTP ' + code + ') : ' + resp.getContentText().slice(0, 400));
      return; // on n'avance pas lastRow -> on réessaiera au prochain passage
    }
    sent += batch.length;
  }
  props.setProperty('lastRow', String(values.length - 1));
  Logger.log('Push OK : ' + sent + ' nouvelle(s) commande(s) envoyée(s) vers Close-Pro.');
}

/** Installation 1 clic : teste, crée le déclencheur minute, ignore l'historique. */
function installer() {
  var ok = testConnexion();
  // Supprime TOUS les déclencheurs du projet (y compris d'anciennes versions/fantômes).
  var trigs = ScriptApp.getProjectTriggers();
  for (var i = 0; i < trigs.length; i++) ScriptApp.deleteTrigger(trigs[i]);
  ScriptApp.newTrigger('pushNouvellesCommandes').timeBased().everyMinutes(1).create();
  marquerDepart();
  Logger.log('— — — — — — — — — — — — — — — — — — — —');
  Logger.log(ok
    ? '✅ INSTALLATION TERMINÉE. Déclencheur minute actif, historique ignoré. Les nouvelles commandes remonteront dans l\'app sous 1 min.'
    : '⚠ Déclencheur créé MAIS la connexion Supabase a échoué (voir ligne « Test connexion » ci-dessus). Vérifie SUPABASE_SERVICE_KEY puis relance « installer ».');
}

/** Vérifie l'URL + la clé Supabase. Lis le résultat dans le journal d'exécution. */
function testConnexion() {
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/orders?select=numero&limit=1', {
    method: 'get',
    muteHttpExceptions: true,
    headers: { apikey: SUPABASE_SERVICE_KEY, Authorization: 'Bearer ' + SUPABASE_SERVICE_KEY },
  });
  var code = resp.getResponseCode();
  var ok = code >= 200 && code < 300;
  Logger.log('Test connexion Supabase : HTTP ' + code + (ok ? ' ✅ OK' : ' ❌ ÉCHEC — ' + resp.getContentText().slice(0, 200)));
  return ok;
}

/** Ignore tout l'historique déjà présent (démarrage à blanc). Appelée par installer(). */
function marquerDepart() {
  var sh = _feuille();
  var n = sh ? sh.getDataRange().getValues().length - 1 : 0;
  PropertiesService.getScriptProperties().setProperty('lastRow', String(n));
  Logger.log('Historique ignoré : ' + n + ' ligne(s) existante(s) ne seront pas (re)poussées.');
}
