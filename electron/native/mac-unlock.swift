import CryptoKit
import Foundation
import LocalAuthentication
import Security

// The private key representation is an opaque Secure Enclave blob, usable only on this Mac.
private struct Envelope: Codable {
  let version: Int?
  let privateKey: Data
  let peerPublicKey: Data
  let ciphertext: Data
}

private enum Failure: Int32, Error {
  case cancelled = 2
  case unavailable, invalid, authentication
}

private struct Binding {
  let info: Data
  let salt: Data
  init(_ reference: String, legacy: Bool) {
    let domain = legacy ? "touch-id" : "mac-unlock"
    info = Data("clever-workbench/\(domain)/1/\(reference)".utf8)
    salt = Data((legacy ? "Clever Workbench Touch ID v1" : "Clever Workbench Mac Unlock v1").utf8)
  }
  func key(_ secret: SharedSecret) -> SymmetricKey {
    secret.hkdfDerivedSymmetricKey(
      using: SHA256.self, salt: salt, sharedInfo: info, outputByteCount: 32)
  }
}

private func open(_ envelope: Envelope, binding: Binding, context: LAContext) throws -> Data {
  let key = try SecureEnclave.P256.KeyAgreement.PrivateKey(
    dataRepresentation: envelope.privateKey, authenticationContext: context)
  let peer = try P256.KeyAgreement.PublicKey(x963Representation: envelope.peerPublicKey)
  let secret = try key.sharedSecretFromKeyAgreement(with: peer)
  let box = try AES.GCM.SealedBox(combined: envelope.ciphertext)
  let result = try AES.GCM.open(box, using: binding.key(secret), authenticating: binding.info)
  guard result.count == 32 else { throw Failure.invalid }
  return result
}

@main
private enum MacUnlockHelper {
  static func run() async throws {
    let args = CommandLine.arguments
    let context = LAContext()
    defer { context.invalidate() }
    if args.count == 2 && args[1] == "available" {
      let available =
        SecureEnclave.isAvailable
        && context.canEvaluatePolicy(.deviceOwnerAuthentication, error: nil)
      FileHandle.standardOutput.write(Data(available ? [1] : [0]))
      return
    }
    guard args.count == 3, ["seal", "open", "open-touch-id"].contains(args[1]),
      args[2].utf8.count == 73
    else {
      throw Failure.invalid
    }
    let input = FileHandle.standardInput.readData(ofLength: 16_385)
    let enrolling = args[1] == "seal"
    guard !input.isEmpty, input.count <= 16_384, !enrolling || input.count == 32 else {
      throw Failure.invalid
    }
    let legacy = args[1] == "open-touch-id"
    let envelope = enrolling ? nil : try JSONDecoder().decode(Envelope.self, from: input)
    if let envelope, envelope.version != (legacy ? nil : 1) { throw Failure.invalid }
    // Only an explicit new enrollment creates a key usable with the Mac login password.
    let policy: LAPolicy =
      legacy ? .deviceOwnerAuthenticationWithBiometrics : .deviceOwnerAuthentication
    guard SecureEnclave.isAvailable, context.canEvaluatePolicy(policy, error: nil),
      !legacy || context.biometryType == .touchID
    else { throw Failure.unavailable }
    let reason = enrolling ? "为工作台启用 Mac 系统解锁" : "解锁工作台凭据"
    context.localizedReason = reason
    context.localizedFallbackTitle = legacy ? "" : "使用 Mac 登录密码"
    context.touchIDAuthenticationAllowableReuseDuration = 0
    guard
      try await context.evaluatePolicy(
        policy,
        localizedReason: reason)
    else {
      throw Failure.authentication
    }
    let binding = Binding(args[2], legacy: legacy)
    if let envelope {
      FileHandle.standardOutput.write(try open(envelope, binding: binding, context: context))
      return
    }
    guard
      let access = SecAccessControlCreateWithFlags(
        nil, kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        [.privateKeyUsage, .userPresence], nil)
    else {
      throw Failure.unavailable
    }
    let key = try SecureEnclave.P256.KeyAgreement.PrivateKey(
      accessControl: access, authenticationContext: context)
    let peer = P256.KeyAgreement.PrivateKey()
    let shared = try peer.sharedSecretFromKeyAgreement(with: key.publicKey)
    guard
      let sealed = try AES.GCM.seal(
        input, using: binding.key(shared),
        authenticating: binding.info
      ).combined
    else { throw Failure.invalid }
    let record = Envelope(
      version: 1, privateKey: key.dataRepresentation,
      peerPublicKey: peer.publicKey.x963Representation,
      ciphertext: sealed)
    // Confirm this enrollment can actually unwrap the material before publishing it.
    guard try open(record, binding: binding, context: context) == input else {
      throw Failure.authentication
    }
    FileHandle.standardOutput.write(try JSONEncoder().encode(record))
  }

  static func main() async {
    do { try await run() } catch let error as Failure { exit(error.rawValue) } catch let error
      as LAError
    {
      switch error.code {
      case .userCancel, .userFallback, .appCancel, .systemCancel: exit(Failure.cancelled.rawValue)
      default: exit(Failure.authentication.rawValue)
      }
    } catch { exit(Failure.invalid.rawValue) }
  }
}
