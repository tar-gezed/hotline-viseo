/* Remote actors share the exact Player/CharacterArt renderer. Their simulation is
 * owned by the host; the client only supplies buffered interpolated poses. */
(function (root) {
  class RemotePlayer extends Player {
    constructor(x, y, mask, slot) { super(x, y, mask); this.playerId = slot; this.networkPrediction = true; }
  }
  root.RemotePlayer = RemotePlayer;
})(window);
