/** @jest-environment node */
/* eslint-disable @typescript-eslint/naming-convention -- Host mocks match VS Code and catalog interfaces. */
import { handleComparisonEqRequest } from "./comparisonEqHost";
import { WebviewMessageType } from "../message";
import * as autoEq from "../extensionHost/autoEqHost";
import * as presets from "../extensionHost/eqPresetHost";
import * as vscode from "vscode";

jest.mock(
  "vscode",
  () => ({
    Uri: {
      joinPath: (base: { path: string }, ...parts: string[]) => ({
        path: [base.path, ...parts].join("/"),
      }),
    },
    workspace: { fs: { createDirectory: jest.fn(), writeFile: jest.fn() } },
  }),
  { virtual: true },
);
jest.mock("../extensionHost/autoEqHost", () => ({
  fetchAutoEqEntriesInHost: jest.fn(),
  fetchAutoEqTargetsInHost: jest.fn(),
  equalizeAutoEqInHost: jest.fn(),
}));
jest.mock("../extensionHost/eqPresetHost", () => ({
  listWorkspaceEqPresetsInHost: jest.fn(),
  readWorkspaceEqPresetInHost: jest.fn(),
  writeWorkspaceEqPresetInHost: jest.fn(),
  pickEqPresetFileInHost: jest.fn(),
}));
const context = {
  globalState: { update: jest.fn() },
} as unknown as vscode.ExtensionContext;
const folder = { uri: { path: "/workspace" } } as vscode.WorkspaceFolder;
beforeEach(() => jest.clearAllMocks());

test("routes catalog and equalization to the existing AutoEq host service", async () => {
  jest
    .mocked(autoEq.fetchAutoEqEntriesInHost)
    .mockResolvedValue({ Headphone: [] });
  expect(
    await handleComparisonEqRequest(
      {
        type: WebviewMessageType.AUTOEQ_REQUEST,
        data: { requestId: "catalog", endpoint: "entries" },
      },
      context,
      folder,
    ),
  ).toEqual({
    type: "AUTOEQ_RESULT",
    data: {
      requestId: "catalog",
      endpoint: "entries",
      payload: { Headphone: [] },
    },
  });
  const body = {
    name: "Headphone",
    source: "source",
    rig: "rig",
    target: "target",
    fs: 48000,
  };
  await handleComparisonEqRequest(
    {
      type: WebviewMessageType.AUTOEQ_REQUEST,
      data: { requestId: "eq", endpoint: "equalize", body },
    },
    context,
    folder,
  );
  expect(autoEq.equalizeAutoEqInHost).toHaveBeenCalledWith(body);
});

test("routes preset import/read and returns recoverable host errors", async () => {
  jest
    .mocked(presets.pickEqPresetFileInHost)
    .mockResolvedValue({ content: "preset", fileName: "headphone.txt" });
  const imported = await handleComparisonEqRequest(
    {
      type: WebviewMessageType.EQ_PRESET_OP,
      data: { requestId: "import", op: "import" },
    },
    context,
    folder,
  );
  expect(imported).toEqual({
    type: "EQ_PRESET_OP_RESULT",
    data: {
      requestId: "import",
      payload: { content: "preset", fileName: "headphone.txt" },
    },
  });
  await handleComparisonEqRequest(
    {
      type: WebviewMessageType.EQ_PRESET_OP,
      data: {
        requestId: "read",
        op: "read",
        payload: { fileName: "headphone.json" },
      },
    },
    context,
    folder,
  );
  expect(presets.readWorkspaceEqPresetInHost).toHaveBeenCalledWith(
    folder.uri,
    "headphone.json",
  );
  const bad = await handleComparisonEqRequest(
    {
      type: WebviewMessageType.EQ_PRESET_OP,
      data: {
        requestId: "bad",
        op: "read",
        payload: { fileName: "../secret.json" },
      },
    },
    context,
    folder,
  );
  expect(bad).toEqual({
    type: "EQ_PRESET_OP_RESULT",
    data: { requestId: "bad", error: expect.any(String) },
  });
});

test("writes the same workspace EQ file used by the single-file editor", async () => {
  const data = { bypassed: true, profile: null };
  await handleComparisonEqRequest(
    { type: WebviewMessageType.WRITE_EQ_PROFILE, data },
    context,
    folder,
  );
  expect(vscode.workspace.fs.writeFile).toHaveBeenCalledWith(
    { path: "/workspace/.vscode/ear-headphone-eq.json" },
    expect.any(Uint8Array),
  );
  await handleComparisonEqRequest(
    { type: WebviewMessageType.SAVE_EQ_SETTINGS, data },
    context,
    folder,
  );
  expect(context.globalState.update).toHaveBeenCalledWith(
    "earAudioPreview.headphoneEq.v1",
    data,
  );
});
