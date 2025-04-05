import { 
    App, 
    Editor, 
    MarkdownView, 
    Modal, 
    Notice, 
    Plugin, 
    PluginSettingTab, 
    Setting, 
    TFile,
    TFolder 
} from 'obsidian';

export default class ImageRenamerPlugin extends Plugin {
    async onload() {
        // Register the paste handler
        this.registerEvent(
            this.app.workspace.on('editor-paste', this.handlePaste.bind(this))
        );
    }

    async handlePaste(evt: ClipboardEvent, editor: Editor, markdownView: MarkdownView) {
        // Check if pasted content contains an image
        if (!evt.clipboardData || !evt.clipboardData.items) {
            return;
        }

        // Look for image data in the clipboard
        const items = evt.clipboardData.items;
        let imageFile = null;
        let fileType = '';
        let fileName = '';

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // Handle image files
            if (item.type.startsWith('image/')) {
                // Prevent default paste behavior
                evt.preventDefault();
                
                const blob = item.getAsFile();
                if (!blob) continue;
                
                imageFile = blob;
                fileType = item.type.split('/')[1];
                
                // Extract filename without extension for the dialog
                let defaultName = '';
                if (blob.name) {
                    // Remove file extension if present
                    const lastDotIndex = blob.name.lastIndexOf('.');
                    if (lastDotIndex !== -1) {
                        defaultName = blob.name.substring(0, lastDotIndex);
                    } else {
                        defaultName = blob.name;
                    }
                } else {
                    defaultName = 'image';
                }
                
                // Open naming modal
                const modal = new ImageRenameModal(this.app, defaultName, async (newName) => {
                    if (newName) {
                        // Always add the extension
                        const fullFileName = `${newName}.${fileType}`;
                        
                        // Handle the image save
                        await this.saveImage(imageFile, fullFileName, markdownView, editor);
                    }
                });
                
                modal.open();
                break;
            }
        }
    }

    async saveImage(imageFile: File, fileName: string, view: MarkdownView, editor: Editor) {
        try {
            // Get current file path
            const currentFilePath = view.file?.path;
            if (!currentFilePath) {
                new Notice('Cannot determine current file path');
                return;
            }

            // Find the closest assets folder
            const assetFolderPath = this.findClosestAssetFolder(currentFilePath);
            
            // Create full path for the new image
            const imagePath = `${assetFolderPath}/${fileName}`;
            
            // Read the image data
            const arrayBuffer = await imageFile.arrayBuffer();
            
            // Save the file to the vault
            await this.app.vault.createBinary(imagePath, arrayBuffer);
            
            // Insert markdown link at cursor position
            const markdownLink = `![${fileName}](${imagePath})`;
            editor.replaceSelection(markdownLink);
            
            new Notice(`Image saved as "${fileName}"`);
        } catch (error) {
            console.error('Error saving image:', error);
            new Notice(`Error saving image: ${error.message}`);
        }
    }

    findClosestAssetFolder(filePath: string): string {
        // Get all path segments
        const pathParts = filePath.split('/');
        pathParts.pop(); // Remove the filename

        // Start from the current directory and move up the tree
        while (pathParts.length > 0) {
            const currentPath = pathParts.join('/');
            
            // Check for 'assets' or 'Assets' folder (with 's' at the end)
            const assetsFolder = `${currentPath}/assets`;
            const AssetsFolder = `${currentPath}/Assets`;
            
            if (this.folderExists(assetsFolder)) {
                return assetsFolder;
            }
            if (this.folderExists(AssetsFolder)) {
                return AssetsFolder;
            }
            
            pathParts.pop(); // Move up one directory
        }
        
        // If no assets folder is found in parent directories,
        // check if there's an assets folder directly in the root
        if (this.folderExists('assets')) {
            return 'assets';
        }
        if (this.folderExists('Assets')) {
            return 'Assets';
        }
        
        // If no assets folder is found anywhere, return the vault root
        return '';
    }

    folderExists(path: string): boolean {
        const folder = this.app.vault.getAbstractFileByPath(path);
        return folder instanceof TFolder;
    }
}

class ImageRenameModal extends Modal {
    private result: string;
    private onSubmit: (result: string) => void;
    private initialFileName: string;
    private inputEl: HTMLInputElement;

    constructor(app: App, initialFileName: string, onSubmit: (result: string) => void) {
        super(app);
        this.initialFileName = initialFileName;
        this.onSubmit = onSubmit;
        this.result = initialFileName;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl('h2', { text: 'Rename Image' });

        // Create form container (but don't use actual form element)
        const formContainer = contentEl.createDiv({ cls: 'image-rename-container' });

        // Create input field
        const inputContainer = formContainer.createDiv({ cls: 'image-rename-input-container' });
        this.inputEl = inputContainer.createEl('input', {
            type: 'text',
            value: this.initialFileName
        });
        this.inputEl.focus();
        this.inputEl.select();
        
        this.inputEl.addEventListener('input', () => {
            this.result = this.inputEl.value;
        });

        // Create buttons
        const buttonContainer = formContainer.createDiv({ cls: 'image-rename-button-container' });
        
        const cancelButton = buttonContainer.createEl('button', {
            text: 'Cancel',
            type: 'button'
        });
        cancelButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.close();
            this.onSubmit(null);
        });

        const submitButton = buttonContainer.createEl('button', {
            text: 'Save',
            type: 'button',
            cls: 'mod-cta'
        });
        submitButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.close();
            this.onSubmit(this.result);
        });

        // Handle Enter key press on the input field
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
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
}
