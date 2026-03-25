# plmc-cli

A command-line interface (CLI) for sending and receiving encrypted, on-chain messages on the Palladium (PLM) blockchain.

This tool acts as a terminal equivalent to the [plmc Electron desktop client](https://github.com/NotRin7/plmc). It is 100% compatible and utilizes the same encryption methods (ECDH + AES-CBC) and on-chain storage logic (OP_RETURN with the `PLMC` prefix).

## Features

- **No Local Node Required:** Connects securely to the network via `ElectrumX` (TLS).
- **End-to-End Encryption:** Messages are encrypted using a shared secret derived from your private key and the recipient's public key (ECDH secp256k1).
- **On-Chain Storage:** Your encrypted messages are permanently anchored in the Palladium blockchain.
- **P2WPKH Native:** Fully supports Bech32 addresses (`plm1...`).

## Requirements

- Node.js (v18 or higher recommended)

## Installation

Clone the repository and install the dependencies:

```bash
git clone https://github.com/NotRin7/plmc-cli.git
cd plmc-cli
npm install
```

*(Optional)* Build it as a standalone executable using `pkg`:
```bash
npm install -g pkg
pkg plmc.js -t node18-linux-x64 -o plmc
```

## Usage

You can run the CLI via Node:

```bash
node plmc.js [command] [options]
```

### Global Options

- `-w, --wif <key>`: Your WIF (Wallet Import Format) Private Key **(Required)**
- `-h, --host <host>`: ElectrumX Host (Default: `palladiumblockchain.net`)
- `-p, --port <port>`: ElectrumX Port (Default: `50002`)
- `-f, --fee <rate>`: Fee rate in sat/vB (Default: `1`)

---

### Commands

#### 1. Show Address & Public Key
Generates your Bech32 address and public key from your WIF.

```bash
node plmc.js address --wif <Your-WIF-Key>
```

#### 2. Check Balance
Retrieves your current confirmed and unconfirmed balance (in satoshis).

```bash
node plmc.js balance --wif <Your-WIF-Key>
```

#### 3. Send a Message
Sends an encrypted message to a specific public key.

```bash
node plmc.js send <Recipient-Public-Key-Hex> "Your message here" --wif <Your-WIF-Key>
```
*Note: Sending a message creates an actual transaction. Your address must have confirmed UTXOs (a balance) to pay the network fee.*

#### 4. Read Inbox
Scans your address history and decrypts incoming messages.

```bash
node plmc.js inbox --wif <Your-WIF-Key>
```

## Technical Details
- **Network Prefix:** `plm`
- **Cryptography:** CryptoJS (AES-CBC + PKCS7) and `tiny-secp256k1`
- **Transaction Output:** `OP_RETURN` data contains the string `PLMC` followed by `ivHex:ciphertext`.
