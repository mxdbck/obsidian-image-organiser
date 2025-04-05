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
  default: () => ImageRenamerPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var ImageRenamerPlugin = class extends import_obsidian.Plugin {
  async onload() {
    this.registerEvent(
      this.app.workspace.on("editor-paste", this.handlePaste.bind(this))
    );
  }
  async handlePaste(evt, editor, markdownView) {
    if (!evt.clipboardData || !evt.clipboardData.items) {
      return;
    }
    const items = evt.clipboardData.items;
    let imageFile = null;
    let fileType = "";
    let fileName = "";
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        evt.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        imageFile = blob;
        fileType = item.type.split("/")[1];
        let defaultName = "";
        if (blob.name) {
          const lastDotIndex = blob.name.lastIndexOf(".");
          if (lastDotIndex !== -1) {
            defaultName = blob.name.substring(0, lastDotIndex);
          } else {
            defaultName = blob.name;
          }
        } else {
          defaultName = "image";
        }
        const modal = new ImageRenameModal(this.app, defaultName, async (newName) => {
          if (newName) {
            const fullFileName = `${newName}.${fileType}`;
            await this.saveImage(imageFile, fullFileName, markdownView, editor);
          }
        });
        modal.open();
        break;
      }
    }
  }
  async saveImage(imageFile, fileName, view, editor) {
    try {
      const currentFilePath = view.file?.path;
      if (!currentFilePath) {
        new import_obsidian.Notice("Cannot determine current file path");
        return;
      }
      const assetFolderPath = this.findClosestAssetFolder(currentFilePath);
      const imagePath = `${assetFolderPath}/${fileName}`;
      const arrayBuffer = await imageFile.arrayBuffer();
      await this.app.vault.createBinary(imagePath, arrayBuffer);
      const markdownLink = `![${fileName}](${imagePath})`;
      editor.replaceSelection(markdownLink);
      new import_obsidian.Notice(`Image saved as "${fileName}"`);
    } catch (error) {
      console.error("Error saving image:", error);
      new import_obsidian.Notice(`Error saving image: ${error.message}`);
    }
  }
  findClosestAssetFolder(filePath) {
    const pathParts = filePath.split("/");
    pathParts.pop();
    while (pathParts.length > 0) {
      const currentPath = pathParts.join("/");
      const assetsFolder = `${currentPath}/assets`;
      const AssetsFolder = `${currentPath}/Assets`;
      if (this.folderExists(assetsFolder)) {
        return assetsFolder;
      }
      if (this.folderExists(AssetsFolder)) {
        return AssetsFolder;
      }
      pathParts.pop();
    }
    if (this.folderExists("assets")) {
      return "assets";
    }
    if (this.folderExists("Assets")) {
      return "Assets";
    }
    return "";
  }
  folderExists(path) {
    const folder = this.app.vault.getAbstractFileByPath(path);
    return folder instanceof import_obsidian.TFolder;
  }
};
var ImageRenameModal = class extends import_obsidian.Modal {
  result;
  onSubmit;
  initialFileName;
  inputEl;
  constructor(app, initialFileName, onSubmit) {
    super(app);
    this.initialFileName = initialFileName;
    this.onSubmit = onSubmit;
    this.result = initialFileName;
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Rename Image" });
    const formContainer = contentEl.createDiv({ cls: "image-rename-container" });
    const inputContainer = formContainer.createDiv({ cls: "image-rename-input-container" });
    this.inputEl = inputContainer.createEl("input", {
      type: "text",
      value: this.initialFileName
    });
    this.inputEl.focus();
    this.inputEl.select();
    this.inputEl.addEventListener("input", () => {
      this.result = this.inputEl.value;
    });
    const buttonContainer = formContainer.createDiv({ cls: "image-rename-button-container" });
    const cancelButton = buttonContainer.createEl("button", {
      text: "Cancel",
      type: "button"
    });
    cancelButton.addEventListener("click", (e) => {
      e.preventDefault();
      this.close();
      this.onSubmit(null);
    });
    const submitButton = buttonContainer.createEl("button", {
      text: "Save",
      type: "button",
      cls: "mod-cta"
    });
    submitButton.addEventListener("click", (e) => {
      e.preventDefault();
      this.close();
      this.onSubmit(this.result);
    });
    this.inputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.close();
        this.onSubmit(this.result);
      }
    });
  }
  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
};
