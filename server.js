require("dotenv").config();
console.log("Configuration Notch Pay :");
console.log("Public Key :", !!process.env.NOTCHPAY_PUBLIC_KEY);
console.log("Hash Key :", !!process.env.NOTCHPAY_HASH_KEY);
console.log("Private Key :", !!process.env.NOTCHPAY_PRIVATE_KEY);
console.log("Mode :", process.env.NOTCHPAY_MODE);


const http = require("http");
const fs = require("fs");
const path = require("path");
const transactionsFile = path.join(__dirname,"transactions.json");

const crypto = require("crypto");
const sessions = new Map();
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const SESSION_DURATION = 8*60*60*1000;
const codesFile = path.join(__dirname, "codes_wifi.json");

// Durée de chaque forfait en minutes
const dureesForfaits = {
  "1 heure": 60,
  "2 heures": 120,
  "3 heures": 180
};

// Lecture des codes enregistrés
function lireCodesWifi() {
  if (!fs.existsSync(codesFile)) {
    fs.writeFileSync(
      codesFile,
      JSON.stringify([], null, 2),
      "utf8"
    );
  }

  return JSON.parse(
    fs.readFileSync(codesFile, "utf8")
  );
}



// Création d'un code après confirmation réelle du paiement
function creerCodeWifi(transaction) {
  if (!transaction || transaction.statut !== "CONFIRME") {
    throw new Error("Paiement non confirmé : code refusé.");
  }

  const duree = dureesForfaits[transaction.forfait];

  if (!duree) {
    throw new Error("Forfait inconnu.");
  }

  const codes = lireCodesWifi();

  // Éviter de créer plusieurs codes pour la même transaction
  const dejaCree = codes.find(
    code => String(code.transactionId) === String(transaction.id)
  );

  if (dejaCree) {
    return dejaCree;
  }

  let nouveauCode;

  do {
    nouveauCode = crypto.randomBytes(4)
      .toString("hex")
      .toUpperCase();
  } while (codes.some(code => code.code === nouveauCode));

  const codeWifi = {
    id: crypto.randomUUID(),
    code: nouveauCode,
    transactionId: transaction.id,
    forfait: transaction.forfait,
    dureeMinutes: duree,
    dateCreation: new Date().toISOString(),
    dateActivation: null,
    dateExpiration: null,
    statut: "EN_ATTENTE"
  };

  codes.push(codeWifi);

  fs.writeFileSync(
    codesFile,
    JSON.stringify(codes, null, 2)
  );

  return codeWifi;
}
// Activer un code Wi-Fi lors de sa première utilisation
function activerCodeWifi(codeSaisi) {
  const codes = lireCodesWifi();

  const code = codes.find(
    c => c.code === String(codeSaisi).trim().toUpperCase()
  );

  if (!code) {
    throw new Error("Code Wi-Fi introuvable.");
  }

  const maintenant = new Date();

  // Vérifier si le forfait est déjà expiré
  if (
    code.statut === "ACTIF" &&
    code.dateExpiration &&
    maintenant >= new Date(code.dateExpiration)
  ) {
    code.statut = "EXPIRE";

    fs.writeFileSync(
      codesFile,
      JSON.stringify(codes, null, 2)
    );

    throw new Error("Ce forfait a expiré.");
  }

  // Refuser les codes déjà expirés ou inutilisables
  if (code.statut === "EXPIRE") {
    throw new Error("Ce code Wi-Fi a expiré.");
  }

  // Première utilisation : démarrer le compteur
  if (code.statut === "EN_ATTENTE") {
    code.dateActivation = maintenant.toISOString();

    code.dateExpiration = new Date(
      maintenant.getTime() + code.dureeMinutes * 60 * 1000
    ).toISOString();

    code.statut = "ACTIF";

    fs.writeFileSync(
      codesFile,
      JSON.stringify(codes, null, 2)
    );
  }

  if (code.statut !== "ACTIF") {
    throw new Error("Ce code n'est pas disponible.");
  }

  return code;
}


// Mettre à jour les codes dont la durée est terminée
function mettreAJourCodesExpires() {
  const codes = lireCodesWifi();
  const maintenant = new Date();
  let modification = false;

  codes.forEach(code => {
    if (
      code.statut === "ACTIF" &&
      code.dateExpiration &&
      maintenant >= new Date(code.dateExpiration)
    ) {
      code.statut = "EXPIRE";
      modification = true;
    }
  });

  if (modification) {
    fs.writeFileSync(
      codesFile,
      JSON.stringify(codes, null, 2)
    );
  }

  return codes;
}
 // Vérifier automatiquement les expirations toutes les 30 secondes
setInterval(() => {
  try {
    mettreAJourCodesExpires();
  } catch (erreur) {
    console.error("Erreur de vérification des forfaits :", erreur);
  }
}, 30000);




const COOKIE_SECURE = process.env.COOKIE_SECURE ==="true";

const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {

if (req.method === "GET" && req.url === "/admin.html") {

  const cookies = (req.headers.cookie || "").split(";");

  const sessionCookie = cookies.find(cookie =>
    cookie.trim().startsWith("wifi_admin_session=")
  );

  const token = sessionCookie
    ? sessionCookie.trim().split("=")[1]
    : null;

  const expiration = token ? sessions.get(token) : null;

  if (!expiration || expiration < Date.now()) {
    if (token) sessions.delete(token);

    res.writeHead(302, {
      "Location": "/login.html"
    });

    return res.end();
  }

  const fichierAdmin = path.join(__dirname, "admin.html");

  fs.readFile(fichierAdmin, (erreur, contenu) => {

    if (erreur) {
      res.writeHead(404);
      return res.end("Page administrateur introuvable");
    }

    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8"
    });

    return res.end(contenu);
  });

  return;
}


  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  if (
    req.method === "GET" && 
    (req.url === "/"||req.url.startsWith("/?"))
  ) {
    const fichier = path.join(__dirname, "index.html");

    fs.readFile(fichier, (erreur, contenu) => {
      if (erreur) {
        res.writeHead(500);
        return res.end("Erreur lors du chargement du site.");
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(contenu);
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/transactions") {
    const cookies = (req.headers.cookie || "").split(";");

const sessionCookie = cookies.find(cookie =>
    cookie.trim().startsWith("wifi_admin_session=")
);

const token = sessionCookie
    ? sessionCookie.trim().slice("wifi_admin_session=".length)
    : null;

const expiration = token ? sessions.get(token) : null;

if (!expiration || expiration < Date.now()) {
    if (token) sessions.delete(token);

    res.writeHead(401, {
        "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
        succes: false,
        message: "Connexion administrateur requise."
    }));
}

  try {
    let historique = [];

    if (fs.existsSync(transactionsFile)) {
      historique = JSON.parse(
        fs.readFileSync(transactionsFile, "utf8")
      );
    }

    res.writeHead(200, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify(historique));

  } catch (erreur) {
    console.error("Erreur historique :", erreur);

    res.writeHead(500, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      succes: false,
      message: "Impossible de lire l'historique."
    }));
  }
}

if (req.method === "POST" && req.url === "/api/test-code") {
  const cookies = (req.headers.cookie || "").split(";");

  const sessionCookie = cookies.find(cookie =>
    cookie.trim().startsWith("wifi_admin_session=")
  );

  const token = sessionCookie
    ? sessionCookie.trim().slice("wifi_admin_session=".length)
    : null;

  const expiration = token ? sessions.get(token) : null;

  if (!expiration || expiration < Date.now()) {
    res.writeHead(401, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      succes: false,
      message: "Connexion administrateur requise."
    }));
  }

  try {
    const transactionTest = {
      id: "TEST-" + crypto.randomUUID(),
      forfait: "1 heure",
      statut: "CONFIRME"
    };

    const code = creerCodeWifi(transactionTest);

    const codes = lireCodesWifi();
    const codeEnregistre = codes.find(
      c => c.id === code.id
    );

    codeEnregistre.statut = "TEST";

    fs.writeFileSync(
      codesFile,
      JSON.stringify(codes, null, 2)
    );

    res.writeHead(200, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      succes: true,
      message: "Code de test créé avec succès.",
      code: codeEnregistre
    }));

  } catch (erreur) {
    console.error("Erreur test code :", erreur);

    res.writeHead(500, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      succes: false,
      message: "Impossible de créer le code de test."
    }));
  }
}
// Activation d'un code Wi-Fi par le client
if (req.method === "POST" && req.url === "/api/activer-code") {
  let corps = "";

  req.on("data", morceau => {
    corps += morceau;

    if (corps.length > 10000) {
      req.destroy();
    }
  });

  req.on("end", async () => {
    try {
      const donnees = JSON.parse(corps);
      const codeSaisi = donnees.code;

      if (!codeSaisi || typeof codeSaisi !== "string") {
        res.writeHead(400, {
          "Content-Type": "application/json"
        });

        return res.end(JSON.stringify({
          succes: false,
          message: "Veuillez saisir votre code Wi-Fi."
        }));
      }

      const code = activerCodeWifi(codeSaisi);

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      return res.end(JSON.stringify({
        succes: true,
        message: "Code accepté. Votre forfait est activé.",
        forfait: code.forfait,
        dateExpiration: code.dateExpiration
      }));

    } catch (erreur) {
      res.writeHead(400, {
        "Content-Type": "application/json"
      });

      return res.end(JSON.stringify({
        succes: false,
        message: erreur.message || "Impossible d'activer ce code."
      }));
    }
  });

  return;
}



if (req.method === "GET" && req.url === "/api/codes") {
  const cookies = (req.headers.cookie || "").split(";");

  const sessionCookie = cookies.find(cookie =>
    cookie.trim().startsWith("wifi_admin_session=")
  );

  const token = sessionCookie
    ? sessionCookie.trim().slice("wifi_admin_session=".length)
    : null;

  const expiration = token ? sessions.get(token) : null;

  if (!expiration || expiration < Date.now()) {
    if (token) sessions.delete(token);

    res.writeHead(401, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      succes: false,
      message: "Connexion administrateur requise."
    }));
  }

  try {
    const codes = lireCodesWifi();

    res.writeHead(200, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify(codes));

  } catch (erreur) {
    console.error("Erreur codes Wi-Fi :", erreur);

    res.writeHead(500, {
      "Content-Type": "application/json"
    });

    return res.end(JSON.stringify({
      succes: false,
      message: "Impossible de lire les codes Wi-Fi."
    }));
  }
}

if (req.method === "POST" && req.url === "/webhooks/notchpay") {
  const morceaux = [];

  req.on("data", morceau => {
    morceaux.push(morceau);
  });

  req.on("end", async () => {
    try {
      // 1. Vérifier la signature Notch Pay
      const corps = Buffer.concat(morceaux);
      const signature = req.headers["x-notch-signature"];
      const hash = process.env.NOTCHPAY_HASH_KEY;

      if (
        !hash ||
        typeof signature !== "string" ||
        !/^[a-f0-9]{64}$/i.test(signature)
      ) {
        res.writeHead(403);
        return res.end("Signature absente ou invalide.");
      }

      const signatureAttendue = crypto
        .createHmac("sha256", hash)
        .update(corps)
        .digest("hex");

      if (
        !crypto.timingSafeEqual(
          Buffer.from(signature, "hex"),
          Buffer.from(signatureAttendue, "hex")
        )
      ) {
        res.writeHead(403);
        return res.end("Signature incorrecte.");
      }

      // 2. Lire la notification
      const evenement = JSON.parse(corps.toString("utf8"));
      const typeEvenement = evenement.type || evenement.event;

      if (typeEvenement !== "payment.complete") {
        console.log("Événement Notch Pay ignoré :", typeEvenement);
        res.writeHead(200);
        return res.end("Événement ignoré.");
      }

      const paiement = evenement.data?.transaction || evenement.data;
      const referencePaiement = paiement?.reference;

      if (!referencePaiement) {
        console.log("Notification sans référence:", paiement);
        res.writeHead(400);
        return res.end("Référence absente.");
      }

      // 3. Retrouver la transaction WIFI ZONE
      if (!fs.existsSync(transactionsFile)) {
        throw new Error("Fichier transactions.json introuvable.");
      }

      const historique = JSON.parse(
        fs.readFileSync(transactionsFile, "utf8")
      );

      const transaction = historique.find(
        t => String(t.referenceNotchPay) ===
             String(referencePaiement)
      );

      if (!transaction) {
        console.error("Transaction introuvable :", paiement.reference);
        res.writeHead(200);
        return res.end("Transaction introuvable.");
      }

      // 4. Vérifier réellement le paiement auprès de Notch Pay
      const reponseVerification = await fetch(
        "https://api.notchpay.co/payments/" +
          encodeURIComponent(paiement.reference),
        {
          method: "GET",
          headers: {
            "Authorization": process.env.NOTCHPAY_PUBLIC_KEY
          }
        }
      );

      const verification = await reponseVerification.json();

      if (!reponseVerification.ok) {
        throw new Error("Échec de vérification auprès de Notch Pay.");
      }

      const paiementVerifie = verification.transaction;
      if (transaction.statut ==="CONFIRME"){
        res.writeHead(200);
        return res.end("Paiement déjà confirmé.");
        }

      if (!paiementVerifie) {
        throw new Error("Informations de paiement introuvables.");
      }

      // 5. Contrôler le statut, la référence, le montant et la devise
      if (
        paiementVerifie.status !== "complete" ||
        String(paiementVerifie.reference) !==
          String(transaction.referenceNotchPay) ||
        Number(paiementVerifie.amount) !==
          Number(transaction.montant) ||
        paiementVerifie.currency !== "XAF"
      ) {
        console.error("Vérification du paiement refusée.");
        res.writeHead(200);
        return res.end("Paiement non validé.");
      }

      // 6. Confirmer la transaction sans créer de doublon
      if (transaction.statut !== "CONFIRME") {
        transaction.statut = "CONFIRME";

        fs.writeFileSync(
          transactionsFile,
          JSON.stringify(historique, null, 2)
        );
      }

      // 7. Créer ou retrouver le code Wi-Fi
      const codeWifi = creerCodeWifi(transaction);

      console.log(
        "Paiement confirmé. Code Wi-Fi :",
        codeWifi.code
      );

      res.writeHead(200, {
        "Content-Type": "text/plain"
      });

      return res.end("Paiement confirmé.");

    } catch (erreur) {
      console.error("Erreur webhook Notch Pay :", erreur);

      res.writeHead(500);
      return res.end("Erreur de traitement du webhook.");
    }
  });

  return;
}





if (req.method === "POST" && req.url === "/api/paiement") {
  let donnees = "";

  req.on("data", morceau => {
    donnees += morceau;

    if (donnees.length > 100000) {
      req.destroy();
    }
  });

  req.on("end", async () => {
    try {
      if (
        process.env.NOTCHPAY_MODE !== "sandbox" ||
        !process.env.NOTCHPAY_PUBLIC_KEY
      ) {
        throw new Error("Configuration Sandbox Notch Pay absente.");
      }

      const paiement = JSON.parse(donnees);

      const tarifs = {
        "1 heure": 300,
        "2 heures": 500,
        "3 heures": 1000
      };

      if (
        tarifs[paiement.forfait] !== paiement.montant ||
        !["Orange Money", "MTN Mobile Money"].includes(paiement.moyen)
      ) {
        res.writeHead(400, {
          "Content-Type": "application/json"
        });

        return res.end(JSON.stringify({
          succes: false,
          message: "Demande de paiement invalide."
        }));
      }

      const champsAutorises = [
        "clientMac", "clientIp", "apMac", "ssidName",
        "radioId", "site", "redirectUrl", "gatewayMac",
        "vid", "t"
      ];

      const connexion = {};

      if (
        paiement.connexion &&
        typeof paiement.connexion === "object" &&
        !Array.isArray(paiement.connexion)
      ) {
        champsAutorises.forEach(champ => {
          const valeur = paiement.connexion[champ];
          connexion[champ] =
            typeof valeur === "string" ? valeur.slice(0, 500) : "";
        });
      }

      const reference = "WIFI-" + Date.now() + "-" +
        crypto.randomBytes(4).toString("hex");

      const reponseNotch = await fetch(
        "https://api.notchpay.co/payments",
        {
          method: "POST",
          headers: {
            "Authorization": process.env.NOTCHPAY_PUBLIC_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            amount: paiement.montant,
            currency: "XAF",
            customer:{
              phone:paiement.telephone
            },
            description: "Forfait WIFI ZONE - " + paiement.forfait,
            reference: reference
          })
        }
      );

      const resultat = await reponseNotch.json();
      console.log("Statut HTTP Notch Pay:",reponseNotch.status);
      console.log("Réponse Notch Pay:",JSON.stringify(resultat, null, 2));

      if (!reponseNotch.ok || !resultat.authorization_url) {
        console.error("Erreur Notch Pay :", resultat);

        throw new Error("Notch Pay n'a pas pu créer le paiement.");
      }

      let historique = [];

      if (fs.existsSync(transactionsFile)) {
        historique = JSON.parse(
          fs.readFileSync(transactionsFile, "utf8")
        );
      }

      historique.push({
        id: Date.now(),
        referenceMarchand: reference,
        referenceNotchPay: resultat.transaction?.reference || "",
        forfait: paiement.forfait,
        montant: paiement.montant,
        moyen: paiement.moyen,
        date: new Date().toLocaleString("fr-FR", {
          timeZone: "Africa/Douala"
        }),
        statut: "EN_ATTENTE",
        connexion: connexion
      });

      fs.writeFileSync(
        transactionsFile,
        JSON.stringify(historique, null, 2)
      );

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      return res.end(JSON.stringify({
        succes: true,
        authorization_url: resultat.authorization_url,
        message: "Demande de paiement créée."
      }));

    } catch (erreur) {
      console.error("Erreur paiement Notch Pay :", erreur);

      if (!res.headersSent) {
        res.writeHead(500, {
          "Content-Type": "application/json"
        });
      }

      return res.end(JSON.stringify({
        succes: false,
        message: "Impossible de créer le paiement."
      }));
    }
  });

  return;
}



if (req.method === "POST" && req.url === "/api/paiement-test") {
  let donnees = "";

  req.on("data", morceau => {
    donnees += morceau;

    if (donnees.length > 100000) {
      req.destroy();
    }
  });

  req.on("end", () => {
    try {
      const paiement = JSON.parse(donnees);

      const tarifs = {
        "1 heure": 300,
        "2 heures": 500,
        "3 heures": 1000
      };

      if (
        tarifs[paiement.forfait] !== paiement.montant ||
        !["Orange Money", "MTN Mobile Money"].includes(paiement.moyen)
      ) {
        res.writeHead(400, {
          "Content-Type": "application/json"
        });

        return res.end(JSON.stringify({
          succes: false,
          message: "Demande invalide."
        }));
      }

      // Récupération des informations transmises par Omada
      const champsAutorises = [
        "clientMac",
        "clientIp",
        "apMac",
        "ssidName",
        "radioId",
        "site",
        "redirectUrl",
        "gatewayMac",
        "vid",
        "t"
      ];

      const connexion = {};

      if (
        paiement.connexion &&
        typeof paiement.connexion === "object" &&
        !Array.isArray(paiement.connexion)
      ) {
        champsAutorises.forEach(champ => {
          const valeur = paiement.connexion[champ];

          if (typeof valeur === "string") {
            connexion[champ] = valeur.slice(0, 500);
          } else {
            connexion[champ] = "";
          }
        });
      }

      const transaction = {
        id: Date.now(),
        forfait: paiement.forfait,
        montant: paiement.montant,
        moyen: paiement.moyen,
        date: new Date().toLocaleString("fr-FR", {
          timeZone: "Africa/Douala"
        }),
        statut: "SIMULATION",
        connexion: connexion
      };

      let historique = [];

      if (fs.existsSync(transactionsFile)) {
        historique = JSON.parse(
          fs.readFileSync(transactionsFile, "utf8")
        );
      }

      historique.push(transaction);

      fs.writeFileSync(
        transactionsFile,
        JSON.stringify(historique, null, 2)
      );

      res.writeHead(200, {
        "Content-Type": "application/json"
      });

      return res.end(JSON.stringify({
        succes: true,
        simulation: true,
        message: "Demande enregistrée. Aucun argent débité."
      }));

    } catch (erreur) {
      console.error("Erreur paiement :", erreur);

      if (!res.headersSent) {
        res.writeHead(500, {
          "Content-Type": "application/json"
        });
      }

      return res.end(JSON.stringify({
        succes: false,
        message: "Erreur lors de l'enregistrement."
      }));
    }
  });

  return;
}

if (req.method === "GET" && req.url === "/login.html") {
    const fichierLogin = path.join(__dirname, "login.html");

    fs.readFile(fichierLogin, (erreur, contenu) => {
        if (erreur) {
            console.error("Erreur login :", erreur);
            res.writeHead(404);
            return res.end("Page de connexion introuvable");
        }

        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8"
        });

        res.end(contenu);
    });

    return;
}

if (req.method === "GET" && req.url === "/connexion.html") {
    const fichierConnexion = path.join(__dirname, "connexion.html");

    fs.readFile(fichierConnexion, (erreur, contenu) => {
        if (erreur) {
            console.error("Erreur connexion client :", erreur);
            res.writeHead(404);
            return res.end("Page de connexion client introuvable");
        }

        res.writeHead(200, {
            "Content-Type": "text/html; charset=utf-8"
        });

        res.end(contenu);
    });

    return;
}


if (req.method === "POST" && req.url === "/admin-login") {
    let donnees = "";

    req.on("data", morceau => {
        donnees += morceau;

        if (donnees.length > 10000) {
            req.destroy();
        }
    });

    req.on("end", () => {
        if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
            res.writeHead(503);
            return res.end("Identifiants administrateur non configurés.");
        }

        const formulaire = new URLSearchParams(donnees);

        const username = formulaire.get("username") || "";
        const password = formulaire.get("password") || "";

        const usernameOK = username === ADMIN_USERNAME;

        const a = Buffer.from(password);
        const b = Buffer.from(ADMIN_PASSWORD);

        const passwordOK =
            a.length === b.length &&
            crypto.timingSafeEqual(a, b);

        if (!usernameOK || !passwordOK) {
            res.writeHead(401, {
                "Content-Type": "text/plain; charset=utf-8"
            });

            return res.end("Identifiant ou mot de passe incorrect.");
        }

        const token = crypto.randomBytes(32).toString("hex");

        sessions.set(token, Date.now() + SESSION_DURATION);

        const cookie = [
            `wifi_admin_session=${token}`,
            "HttpOnly",
            "SameSite=Strict",
            "Path=/",
            `Max-Age=${SESSION_DURATION / 1000}`,
            ...(COOKIE_SECURE ? ["Secure"] : [])
        ].join("; ");

        res.writeHead(303, {
            "Location": "/admin.html",
            "Set-Cookie": cookie
        });

        return res.end();
    });

    return;
}

if (req.method === "POST" && req.url === "/admin-logout") {
    const cookies = (req.headers.cookie || "").split(";");

    const sessionCookie = cookies.find(cookie =>
        cookie.trim().startsWith("wifi_admin_session=")
    );

    const token = sessionCookie
        ? sessionCookie.trim().slice("wifi_admin_session=".length)
        : null;

    if (token) sessions.delete(token);

    res.writeHead(303, {
        "Location": "/login.html",
        "Set-Cookie": "wifi_admin_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"
    });

    return res.end();
}


  res.writeHead(404);
  res.end("Page introuvable.");
});

server.listen(PORT, () => {
  console.log("WIFI ZONE NGOUMBA MABI démarré !");
  console.log("Ouvre http://localhost:3000 dans Chrome.");
});

