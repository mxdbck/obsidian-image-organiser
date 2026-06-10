import {
    App,
    Editor,
    MarkdownView,
    Modal,
    Notice,
    Plugin,
    TFolder,
} from "obsidian";

function generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}

export default class ImageRenamerPlugin extends Plugin {
    async onload() {
        this.registerDomEvent(window, "paste", this.handlePaste.bind(this), {
            capture: true,
        });
    }

    async handlePaste(evt: ClipboardEvent) {
        if (!evt.clipboardData?.items) {
            return;
        }

        let imageItem: DataTransferItem | null = null;
        for (let i = 0; i < evt.clipboardData.items.length; i++) {
            if (evt.clipboardData.items[i].type.startsWith("image/")) {
                imageItem = evt.clipboardData.items[i];
                break;
            }
        }

        if (!imageItem) {
            return;
        }

        const activeView = this.app.workspace.activeLeaf?.view;
        if (!activeView) {
            return;
        }

        const viewType = activeView.getViewType();
        const isCanvas = viewType === "canvas";
        const isMarkdown = viewType === "markdown";

        if (!isCanvas && !isMarkdown) {
            return;
        }

        evt.preventDefault();
        evt.stopImmediatePropagation();

        const blob = imageItem.getAsFile();
        if (!blob) {
            return;
        }

        const fileType = imageItem.type.split("/")[1];

        if (isMarkdown) {
            const markdownView = activeView as MarkdownView;
            const filePath = markdownView.file?.path;
            const editor = markdownView.editor;

            if (!filePath || !editor) {
                new Notice("Cannot determine current file path");
                return;
            }

            const cursor = editor.getCursor();
            const assetFolderPath = this.findClosestAssetFolder(filePath);

            new ImageRenameModal(this.app, generateUUID(), async (newName) => {
                if (!newName) return;

                const fileName = `${newName}.${fileType}`;
                const imagePath = assetFolderPath
                    ? `${assetFolderPath}/${fileName}`
                    : fileName;

                try {
                    await this.app.vault.createBinary(
                        imagePath,
                        await blob.arrayBuffer(),
                    );
                    editor.setCursor(cursor);
                    editor.replaceSelection(`![${fileName}](${imagePath})`);
                    new Notice(`Image saved as "${fileName}"`);
                } catch (error) {
                    console.error("[ImageRenamer] Error saving image:", error);
                    new Notice(`Error saving image: ${error.message}`);
                }
            }).open();
        } else if (isCanvas) {
            const canvasView = activeView as any;
            const canvas = canvasView.canvas;

            const canvasFilePath: string =
                canvasView.file?.path ??
                canvasView.canvas?.file?.path ??
                canvasView.leaf?.view?.file?.path ??
                "";

            const assetFolderPath = canvasFilePath
                ? this.findClosestAssetFolder(canvasFilePath)
                : this.folderExists("assets")
                  ? "assets"
                  : "Assets";

            // Determine if a valid text/markdown card is currently selected
            let targetNode: any = null;
            let targetEditor: Editor | null = null;
            let cursor: any = null;

            if (canvas && canvas.selection && canvas.selection.size === 1) {
                const selectedNode = Array.from(canvas.selection)[0] as any;
                // Grab the internal editor if the user is actively editing the node
                targetEditor =
                    selectedNode.child?.editor ??
                    selectedNode.child?.view?.editor;

                // Make sure it's a node we can actually inject text into
                if (targetEditor || typeof selectedNode.text === "string") {
                    targetNode = selectedNode;
                    if (targetEditor) {
                        cursor = targetEditor.getCursor();
                    }
                }
            }

            new ImageRenameModal(this.app, generateUUID(), async (newName) => {
                if (!newName) return;

                const fileName = `${newName}.${fileType}`;
                const imagePath = assetFolderPath
                    ? `${assetFolderPath}/${fileName}`
                    : fileName;

                try {
                    await this.app.vault.createBinary(
                        imagePath,
                        await blob.arrayBuffer(),
                    );

                    if (canvas) {
                        if (targetNode) {
                            // 1. Insert directly into the selected text card
                            if (targetEditor) {
                                if (cursor) targetEditor.setCursor(cursor);
                                targetEditor.replaceSelection(
                                    `![${fileName}](${imagePath})`,
                                );
                            } else {
                                // Append if they have it selected but aren't actively focused/typing in it
                                targetNode.setText(
                                    targetNode.text +
                                        `\n![${fileName}](${imagePath})`,
                                );
                            }
                        } else {
                            // 2. No valid card selected, fallback to creating a standalone node
                            const file =
                                this.app.vault.getAbstractFileByPath(imagePath);
                            if (file) {
                                const center = canvas.getViewportCenter?.();
                                const { x, y } = center ?? { x: 0, y: 0 };

                                canvas.createFileNode({
                                    file,
                                    pos: { x, y },
                                    size: { width: 400, height: 300 },
                                    focus: true,
                                });
                            }
                        }

                        // Force the canvas to persist the changes
                        canvas.requestSave?.();
                    }

                    new Notice(`Image saved as "${fileName}"`);
                } catch (error) {
                    console.error(
                        "[ImageRenamer] Error saving canvas image:",
                        error,
                    );
                    new Notice(`Error saving image: ${error.message}`);
                }
            }).open();
        }
    }

    findClosestAssetFolder(filePath: string): string {
        const pathParts = filePath.split("/");
        pathParts.pop();

        while (pathParts.length > 0) {
            const currentPath = pathParts.join("/");
            const a = `${currentPath}/assets`;
            const A = `${currentPath}/Assets`;

            if (this.folderExists(a)) return a;
            if (this.folderExists(A)) return A;
            pathParts.pop();
        }

        if (this.folderExists("assets")) return "assets";
        if (this.folderExists("Assets")) return "Assets";
        return "";
    }

    folderExists(path: string): boolean {
        return this.app.vault.getAbstractFileByPath(path) instanceof TFolder;
    }
}

class ImageRenameModal extends Modal {
    private result: string;
    private onSubmit: (result: string | null) => void;
    private inputEl: HTMLInputElement;

    constructor(
        app: App,
        initialFileName: string,
        onSubmit: (result: string | null) => void,
    ) {
        super(app);
        this.result = initialFileName;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Rename Image" });

        const formContainer = contentEl.createDiv({
            cls: "image-rename-container",
        });
        const inputContainer = formContainer.createDiv({
            cls: "image-rename-input-container",
        });

        this.inputEl = inputContainer.createEl("input", {
            type: "text",
            value: this.result,
        });
        this.inputEl.focus();
        this.inputEl.select();
        this.inputEl.addEventListener("input", () => {
            this.result = this.inputEl.value;
        });

        const buttonContainer = formContainer.createDiv({
            cls: "image-rename-button-container",
        });

        const cancelButton = buttonContainer.createEl("button", {
            text: "Cancel",
            type: "button",
        });
        cancelButton.addEventListener("click", (e) => {
            e.preventDefault();
            this.close();
            this.onSubmit(null);
        });

        const submitButton = buttonContainer.createEl("button", {
            text: "Save",
            type: "button",
            cls: "mod-cta",
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
        this.contentEl.empty();
    }
}
