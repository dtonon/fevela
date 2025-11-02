const SEED = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

export function randomString(len = 16) {
  let str = ''
  for (let i = 0; i < len; i++) {
    str += SEED[Math.floor(Math.random() * SEED.length)]
  }
  return str
}
