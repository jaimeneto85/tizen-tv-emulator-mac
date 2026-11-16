import AVFoundation
import CoreImage
import Foundation

let eventOutput = FileHandle.standardOutput
let frameOutput = FileHandle(fileDescriptor: 3)
let muted = CommandLine.arguments.contains("--muted")
let maxFrameWidth: CGFloat = 960

func emit(_ event: String, _ fields: [String: Any] = [:]) {
    var payload = fields
    payload["event"] = event
    guard let data = try? JSONSerialization.data(withJSONObject: payload) else { return }
    eventOutput.write(data)
    eventOutput.write(Data([0x0a]))
}

final class VideoPlane: NSObject {
    private let player = AVPlayer()
    private let imageContext = CIContext()
    private var item: AVPlayerItem?
    private var output: AVPlayerItemVideoOutput?
    private var statusObservation: NSKeyValueObservation?
    private var frameTimer: Timer?
    private var timeTimer: Timer?
    private var prepared = false
    private var prepareRequested = false
    private var playing = false
    private var rate: Float = 1
    private var needsFrame = true

    override init() {
        super.init()
        player.isMuted = muted
        player.automaticallyWaitsToMinimizeStalling = true
        frameTimer = Timer.scheduledTimer(withTimeInterval: 1.0 / 20.0, repeats: true) { [weak self] _ in self?.captureFrame() }
        timeTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in
            guard let self = self, self.playing else { return }
            emit("time", self.timing())
        }
    }

    private func timing() -> [String: Any] {
        let position = player.currentTime().seconds
        let duration = item?.duration.seconds ?? 0
        return [
            "positionMs": position.isFinite ? max(0, Int(position * 1000)) : 0,
            "durationMs": duration.isFinite ? max(0, Int(duration * 1000)) : 0,
        ]
    }

    func handle(_ command: [String: Any]) {
        guard let op = command["op"] as? String else { return }
        switch op {
        case "open":
            guard let text = command["url"] as? String, let url = URL(string: text) else {
                emit("error", ["message": "Invalid media URL"])
                return
            }
            open(url)
        case "prepare":
            prepareRequested = true
            if let item = item, player.currentItem !== item { player.replaceCurrentItem(with: item) }
            announcePreparedIfReady()
        case "start":
            playing = true
            player.playImmediately(atRate: rate)
            emit("playing", timing())
        case "pause":
            playing = false
            player.pause()
            emit("paused", timing())
        case "stop":
            playing = false
            player.pause()
            player.seek(to: .zero, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in self?.needsFrame = true }
        case "seek":
            let milliseconds = (command["ms"] as? NSNumber)?.doubleValue ?? 0
            let target = CMTime(seconds: max(0, milliseconds / 1000), preferredTimescale: 1000)
            player.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in
                guard let self = self else { return }
                self.needsFrame = true
                emit("seeked", self.timing())
            }
        case "volume":
            player.volume = Float(max(0, min(1, (command["value"] as? NSNumber)?.doubleValue ?? 1)))
        case "mute":
            player.isMuted = muted || ((command["value"] as? NSNumber)?.boolValue ?? false)
        case "rate":
            rate = Float((command["value"] as? NSNumber)?.doubleValue ?? 1)
            if playing { player.rate = rate }
        case "close":
            exit(0)
        default:
            break
        }
    }

    private func open(_ url: URL) {
        NotificationCenter.default.removeObserver(self)
        statusObservation = nil
        prepared = false
        prepareRequested = false
        playing = false
        let newItem = AVPlayerItem(url: url)
        let newOutput = AVPlayerItemVideoOutput(pixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
        ])
        newItem.add(newOutput)
        item = newItem
        output = newOutput
        statusObservation = newItem.observe(\.status, options: [.new]) { [weak self] observed, _ in
            DispatchQueue.main.async {
                guard let self = self, self.item === observed else { return }
                if observed.status == .failed {
                    emit("error", ["message": observed.error?.localizedDescription ?? "Media playback error"])
                } else {
                    self.announcePreparedIfReady()
                }
            }
        }
        NotificationCenter.default.addObserver(self, selector: #selector(reachedEnd), name: .AVPlayerItemDidPlayToEndTime, object: newItem)
        NotificationCenter.default.addObserver(self, selector: #selector(failedToEnd(_:)), name: .AVPlayerItemFailedToPlayToEndTime, object: newItem)
        player.replaceCurrentItem(with: newItem)
    }

    private func announcePreparedIfReady() {
        guard prepareRequested, !prepared, let item = item, item.status == .readyToPlay else { return }
        prepared = true
        needsFrame = true
        emit("prepared", timing())
    }

    @objc private func reachedEnd() {
        playing = false
        emit("ended", timing())
    }

    @objc private func failedToEnd(_ notification: Notification) {
        playing = false
        let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
        emit("error", ["message": error?.localizedDescription ?? "Media playback error"])
    }

    private func captureFrame() {
        guard let item = item, let output = output, item.status == .readyToPlay else { return }
        let time = item.currentTime()
        guard output.hasNewPixelBuffer(forItemTime: time) || needsFrame,
              let buffer = output.copyPixelBuffer(forItemTime: time, itemTimeForDisplay: nil) else { return }
        needsFrame = false
        var image = CIImage(cvPixelBuffer: buffer)
        if image.extent.width > maxFrameWidth {
            let scale = maxFrameWidth / image.extent.width
            image = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
        }
        guard let colorSpace = CGColorSpace(name: CGColorSpace.sRGB),
              let jpeg = imageContext.jpegRepresentation(of: image, colorSpace: colorSpace, options: [
                  CIImageRepresentationOption(rawValue: kCGImageDestinationLossyCompressionQuality as String): 0.7,
              ]) else { return }
        var length = UInt32(jpeg.count).bigEndian
        frameOutput.write(Data(bytes: &length, count: 4))
        frameOutput.write(jpeg)
    }
}

signal(SIGPIPE, SIG_IGN)
let plane = VideoPlane()
Thread.detachNewThread {
    while let line = readLine(strippingNewline: true) {
        guard let data = line.data(using: .utf8),
              let command = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any] else { continue }
        DispatchQueue.main.async { plane.handle(command) }
    }
    exit(0)
}
RunLoop.main.run()
