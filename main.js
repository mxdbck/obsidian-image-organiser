var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => SmartImagePastePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  defaultImageFolder: "",
  timeoutBeforeMoving: 300,
  defaultNameFormat: "image-{{date}}"
};
var SmartImagePastePlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.lastPastedImagePath = null;
  }
  async onload() {
    await this.loadSettings();
    this.registerEvent(this.app.workspace.on("editor-paste", this.handlePasteEvent.bind(this)));
    this.registerEvent(this.app.vault.on("create", this.onFileCreated.bind(this)));
    this.addSettingTab(new SmartImagePasteSettingTab(this.app, this));
  }
  onunload() {
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  async handlePasteEvent(evt, editor, view) {
    const items = evt.clipboardData?.items;
    if (!items)
      return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        evt.preventDefault();
        const file = item.getAsFile();
        if (!file)
          continue;
        let suggestedName = this.getSuggestedImageName(file);
        const imageTitle = await this.promptForImageTitle(suggestedName);
        if (!imageTitle) {
          new import_obsidian.Notice("Image paste cancelled");
          return;
        }
        const fileExt = this.getFileExtFromMime(item.type);
        const fileName = `${imageTitle}${fileExt}`;
        try {
          const path = this.settings.defaultImageFolder || "";
          const finalPath = (0, import_obsidian.normalizePath)(path ? path + "/" + fileName : fileName);
          this.lastPastedImagePath = finalPath;
          const buffer = await file.arrayBuffer();
          await this.app.vault.createBinary(finalPath, buffer);
          const imageMarkdown = `![${imageTitle}](${finalPath})`;
          editor.replaceSelection(imageMarkdown);
          new import_obsidian.Notice(`Image saved as "${fileName}". Opening move dialog...`);
        } catch (error) {
          console.error("Error handling image paste:", error);
          new import_obsidian.Notice("Failed to process pasted image");
          this.lastPastedImagePath = null;
        }
      }
    }
  }
  getSuggestedImageName(file) {
    let name = file.name;
    if (name && name !== "image.png" && name !== "image.jpg") {
      const lastDotIndex = name.lastIndexOf(".");
      if (lastDotIndex > 0) {
        name = name.substring(0, lastDotIndex);
      }
      return name;
    }
    return this.getDefaultImageName();
  }
  getDefaultImageName() {
    const date = (0, import_obsidian.moment)().format("YYYY-MM-DD");
    const time = (0, import_obsidian.moment)().format("HHmmss");
    return this.settings.defaultNameFormat.replace("{{date}}", date).replace("{{time}}", time);
  }
  onFileCreated(file) {
    if (this.lastPastedImagePath && file.path === this.lastPastedImagePath && file instanceof import_obsidian.TFile) {
      this.lastPastedImagePath = null;
      setTimeout(() => {
        this.moveImageFile(file);
      }, this.settings.timeoutBeforeMoving);
    }
  }
  async moveImageFile(file) {
    try {
      await this.app.workspace.getLeaf().openFile(file);
      this.app.commands.executeCommandById("file-explorer:move-file");
    } catch (error) {
      console.error("Error moving image file:", error);
      new import_obsidian.Notice(`Error moving file. You can move "${file.path}" manually.`);
    }
  }
  async promptForImageTitle(defaultName) {
    return new Promise((resolve) => {
      const modal = new ImageTitleModal(this.app, defaultName, (result) => {
        resolve(result);
      });
      modal.open();
    });
  }
  getFileExtFromMime(mimeType) {
    const mimeToExt = {
      "image/jpeg": ".jpg",
      "image/png": ".png",
      "image/gif": ".gif",
      "image/webp": ".webp",
      "image/svg+xml": ".svg",
      "image/bmp": ".bmp",
      "image/tiff": ".tiff"
    };
    return mimeToExt[mimeType] || ".png";
  }
};
var ImageTitleModal = class extends import_obsidian.Modal {
  constructor(app, defaultName, onSubmit) {
    super(app);
    this.result = null;
    this.defaultName = defaultName;
    this.onSubmit = onSubmit;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Enter Image Title" });
    this.inputEl = contentEl.createEl("input", {
      type: "text",
      value: this.defaultName,
      placeholder: "Image title",
      attr: { autofocus: true }
    });
    this.inputEl.focus();
    this.inputEl.select();
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        this.result = this.inputEl.value;
        this.close();
      }
    });
    const buttonDiv = contentEl.createDiv({ cls: "modal-button-container" });
    buttonDiv.createEl("button", { text: "Cancel" }).addEventListener("click", () => {
      this.close();
    });
    const submitButton = buttonDiv.createEl("button", {
      text: "Save",
      cls: "mod-cta"
    });
    submitButton.addEventListener("click", () => {
      this.result = this.inputEl.value;
      this.close();
    });
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.onSubmit(this.result);
  }
};
var SmartImagePasteSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Smart Image Paste Settings" });
    new import_obsidian.Setting(containerEl).setName("Default image folder").setDesc("Where to initially save images before moving. Leave empty for root folder.").addText((text) => text.setPlaceholder("e.g., Attachments/Images/").setValue(this.plugin.settings.defaultImageFolder).onChange(async (value) => {
      this.plugin.settings.defaultImageFolder = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Timeout before moving").setDesc("Milliseconds to wait before opening the move dialog (adjust if needed)").addSlider((slider) => slider.setLimits(100, 1e3, 50).setValue(this.plugin.settings.timeoutBeforeMoving).setDynamicTooltip().onChange(async (value) => {
      this.plugin.settings.timeoutBeforeMoving = value;
      await this.plugin.saveSettings();
    }));
    new import_obsidian.Setting(containerEl).setName("Default image name format").setDesc("Format to use when original filename is not available. Use {{date}} and {{time}} as placeholders.").addText((text) => text.setPlaceholder("image-{{date}}").setValue(this.plugin.settings.defaultNameFormat).onChange(async (value) => {
      this.plugin.settings.defaultNameFormat = value;
      await this.plugin.saveSettings();
    }));
  }
};
