import bitcoin from 'bitcoinjs-lib'
import axios from 'axios'

import networks from './networks'
import getEnpointUrl from '../getEndpointUrl'
import BigNumber from '../bignumber'

const getUnique = values => {
  const map = values.reduce((m, v) => {
    m[v] = 1
    return m
  }, { })
  return Object.keys(map)
}

export default class BtcBaseApi {
  constructor (crypto, passphrase) {
    const network = this._network = networks[crypto]

    const pwHash = bitcoin.crypto.sha256(Buffer.from(passphrase))
    this._keyPair = bitcoin.ECPair.fromPrivateKey(pwHash, { network })
    this._address = bitcoin.payments.p2pkh({ pubkey: this._keyPair.publicKey, network }).address
    this._clients = { }
    this._crypto = crypto
  }

  get multiplier () {
    return 1e8
  }

  get address () {
    return this._address
  }

  /**
   * Retrieves current balance
   * @abstract
   * @returns {Promise<number>}
   */
  getBalance () {
    return Promise.resolve(0)
  }

  /**
   * Returns transaction fee
   * @abstract
   * @returns {number}
   */
  getFee () {
    return 0
  }

  /**
   * Creates a transfer transaction hex and ID
   * @param {string} address receiver address
   * @param {number} amount amount to transfer (coins, not satoshis)
   * @returns {Promise<{hex: string, txid: string}>}
   */
  createTransaction (address = '', amount = 0) {
    return this._getUnspents().then(unspents => {
      const hex = this._buildTransaction(address, amount, unspents)

      let txid = bitcoin.crypto.sha256(Buffer.from(hex, 'hex'))
      txid = bitcoin.crypto.sha256(Buffer.from(txid))
      txid = txid.toString('hex').match(/.{2}/g).reverse().join('')

      return { hex, txid }
    })
  }

  /**
   * Broadcasts the specified transaction to the network.
   * @abstract
   * @param {string} txHex raw transaction as a HEX literal
   */
  sendTransaction (txHex) {
    return Promise.resolve('')
  }

  /**
   * Retrieves transaction details
   * @abstract
   * @param {*} txid transaction ID
   * @returns {Promise<object>}
   */
  getTransaction (txid) {
    return Promise.resolve(null)
  }

  /**
   * Retrieves transactions for the specified address
   * @abstract
   * @param {any} options crypto-specific options
   * @returns {Promise<{hasMore: boolean, items: Array}>}
   */
  getTransactions (options) {
    return Promise.resolve({ hasMore: false, items: [] })
  }

  /**
   * Retrieves unspents (UTXO)
   * @abstract
   * @returns {Promise<Array<{txid: string, vout: number, amount: number}>>}
   */
  _getUnspents () {
    return Promise.resolve([])
  }

  /**
   * Creates a raw DOGE transaction as a hex string.
   * @param {string} address target address
   * @param {number} amount amount to send
   * @param {Array<{txid: string, amount: number, vout: number}>} unspents unspent transaction to use as inputs
   * @returns {string}
   */
  _buildTransaction (address, amount, unspents) {
    amount = new BigNumber(amount).times(this.multiplier).toNumber()
    amount = Math.floor(amount)

    const txb = new bitcoin.TransactionBuilder(this._network)
    txb.setVersion(1)

    const target = amount + new BigNumber(this.getFee()).times(this.multiplier).toNumber()
    let transferAmount = 0
    let inputs = 0

    unspents.forEach(tx => {
      const amt = Math.floor(tx.amount)
      if (transferAmount < target) {
        txb.addInput(tx.txid, tx.vout)
        transferAmount += amt
        inputs++
      }
    })

    txb.addOutput(address, amount)
    txb.addOutput(this._address, transferAmount - target)

    for (let i = 0; i < inputs; ++i) {
      txb.sign(i, this._keyPair)
    }

    return txb.build().toHex()
  }

  /** Picks a client for a random API endpoint */
  _getClient () {
    const url = getEnpointUrl(this._crypto)
    if (!this._clients[url]) {
      this._clients[url] = axios.create({
        baseURL: url
      })
    }
    return this._clients[url]
  }

  _mapTransaction (tx) {
    const senders = getUnique(tx.vin.map(x => x.addr))

    const direction = senders.includes(this._address) ? 'from' : 'to'

    const recipients = getUnique(tx.vout.reduce((list, out) => {
      list.push(...out.scriptPubKey.addresses)
      return list
    }, []))

    if (direction === 'from') {
      // Disregard our address for the outgoing transaction unless it's the only address
      // (i.e. we're sending to ourselves)
      const idx = recipients.indexOf(this._address)
      if (idx >= 0 && recipients.length > 1) recipients.splice(idx, 1)
    }

    let senderId, recipientId
    if (direction === 'from') {
      senderId = this._address
      recipientId = recipients.length === 1 ? recipients[0] : undefined
    } else {
      senderId = senders.length === 1 ? senders[0] : undefined
      recipientId = this._address
    }

    // Calculate amount from outputs:
    // * for the outgoing transactions take outputs that DO NOT target us
    // * for the incoming transactions take ouputs that DO target us
    let amount = tx.vout.reduce((sum, t) =>
      ((direction === 'to') === (t.scriptPubKey.addresses.includes(this._address)) ? sum + Number(t.value) : sum), 0)

    const confirmations = tx.confirmations
    const timestamp = tx.time ? tx.time * 1000 : undefined

    let fee = tx.fees
    if (!fee) {
      const totalIn = tx.vin.reduce((sum, x) => sum + x.value, 0)
      const totalOut = tx.vout.reduce((sum, x) => sum + x.value, 0)
      fee = totalIn - totalOut
    }

    return {
      id: tx.txid,
      hash: tx.txid,
      fee,
      status: confirmations > 0 ? 'SUCCESS' : 'PENDING',
      timestamp,
      direction,
      senders,
      senderId,
      recipients,
      recipientId,
      amount,
      confirmations
    }
  }
}