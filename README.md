# 🦾 PLMC CLI

Command-line interface for **Palladium Secure Chat** (PLMC).  
Send and receive encrypted, on-chain messages on the Palladium blockchain directly from your terminal.

---

## 🚀 Features
- **Zero-GUI:** Lightweight Node.js implementation.
- **On-Chain Messaging:** Uses `OP_RETURN` with the `PLMC` prefix.
- **End-to-End Encryption:** ECDH (secp256k1) shared secrets + AES-CBC encryption.
- **ElectrumX Powered:** Connects to any Palladium ElectrumX server (no local node needed).
- **Bech32 Native:** Supports P2WPKH addresses.

---

## 🛠️ Installation

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm

### 2. Setup
```bash
git clone https://github.com/NotRin7/plmc-cli.git
cd plmc-cli
npm install
```

---

## 📖 Usage

All commands require your **WIF Private Key** to derive your address and sign transactions.

### Show your details
Get your Palladium address and public key (hex) for sharing with contacts.
```bash
node plmc.js -w <YOUR_WIF> address
```

### Check balance
See your confirmed and unconfirmed PLM balance.
```bash
node plmc.js -w <YOUR_WIF> balance
```

### Send a message
Send an encrypted message to a contact using their Public Key (Hex).
```bash
node plmc.js -w <YOUR_WIF> send <RECIPIENT_PUBKEY_HEX> "Hello from the CLI!"
```

### Read Inbox
Scan the blockchain history for incoming messages from your contacts.
```bash
node plmc.js -w <YOUR_WIF> inbox
```

---

## ⚙️ Options
| Option | Description | Default |
|--------|-------------|---------|
| `-w, --wif` | Your WIF Private Key | **Required** |
| `-h, --host` | ElectrumX Server Host | `palladiumblockchain.net` |
| `-p, --port` | ElectrumX Server Port | `50002` |
| `-f, --fee` | Fee rate (sat/vB) | `1` |

---

## 🔒 Security
- **Private Keys:** Your WIF is never stored by the CLI. It is only used in-memory for the current command.
- **Encryption:** Messages are encrypted using a shared secret derived from your private key and the recipient's public key. Only you and the recipient can read them.
- **Disclaimer:** This is experimental software. Use small amounts of PLM and handle your keys with care.

---

## 📄 License
MIT © [Palladium Team](https://github.com/NotRin7)
