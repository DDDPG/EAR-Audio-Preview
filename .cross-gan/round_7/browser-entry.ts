import PlayerService from '/Users/lertoon/vscProjects/EAR-Audio-Preview/src/webview/services/playerService';
import PlayerSettingsService from '/Users/lertoon/vscProjects/EAR-Audio-Preview/src/webview/services/playerSettingsService';
import AnalyzeSettingsService from '/Users/lertoon/vscProjects/EAR-Audio-Preview/src/webview/services/analyzeSettingsService';
import EditExportSettingsService from '/Users/lertoon/vscProjects/EAR-Audio-Preview/src/webview/services/editExportSettingsService';
import EditListenService from '/Users/lertoon/vscProjects/EAR-Audio-Preview/src/webview/services/editListenService';
import {measureRms,measureResidual,commonMeasurementRange} from '/Users/lertoon/vscProjects/EAR-Audio-Preview/src/webview/comparison/comparisonMeasurements';
import {setLoudnessWorkletModuleUrl} from '/Users/lertoon/vscProjects/EAR-Audio-Preview/src/webview/utils/loudnessWorkletLoader';
Object.assign(window,{reviewApi:{PlayerService,PlayerSettingsService,AnalyzeSettingsService,EditExportSettingsService,EditListenService,measureRms,measureResidual,commonMeasurementRange,setLoudnessWorkletModuleUrl}});
