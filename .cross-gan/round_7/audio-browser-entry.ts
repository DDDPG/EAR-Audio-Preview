import PlayerService from '../../src/webview/services/playerService';
import BaselinePlayerService from '/tmp/ear-refine-fixes-20261016/baseline/src/webview/services/playerService';
import PlayerSettingsService from '../../src/webview/services/playerSettingsService';
import AnalyzeSettingsService from '../../src/webview/services/analyzeSettingsService';
import {setLoudnessWorkletModuleUrl} from '../../src/webview/utils/loudnessWorkletLoader';
import {setLoudnessWorkletModuleUrl as setBaselineWorkletUrl} from '/tmp/ear-refine-fixes-20261016/baseline/src/webview/utils/loudnessWorkletLoader';
Object.assign(window,{audioReviewApi:{PlayerService,BaselinePlayerService,PlayerSettingsService,AnalyzeSettingsService,setLoudnessWorkletModuleUrl,setBaselineWorkletUrl}});
