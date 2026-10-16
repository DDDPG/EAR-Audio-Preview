import PlayerService from '../../src/webview/services/playerService';
import PlayerSettingsService from '../../src/webview/services/playerSettingsService';
import AnalyzeSettingsService from '../../src/webview/services/analyzeSettingsService';
import EditExportSettingsService from '../../src/webview/services/editExportSettingsService';
import EditListenService from '../../src/webview/services/editListenService';
import {measureRms,measureResidual,commonMeasurementRange} from '../../src/webview/comparison/comparisonMeasurements';
import {setLoudnessWorkletModuleUrl} from '../../src/webview/utils/loudnessWorkletLoader';
Object.assign(window,{reviewApi:{PlayerService,PlayerSettingsService,AnalyzeSettingsService,EditExportSettingsService,EditListenService,measureRms,measureResidual,commonMeasurementRange,setLoudnessWorkletModuleUrl}});
