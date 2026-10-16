// The harness resolves these aliases to the selected source tree in its temporary build.
import PlayerService from "@monitor-player";
import PlayerSettingsService from "@monitor-player-settings";
import AnalyzeSettingsService from "@monitor-analyze-settings";

Object.assign(window, {
  monitorStartupApi: {
    PlayerService,
    PlayerSettingsService,
    AnalyzeSettingsService,
  },
});
