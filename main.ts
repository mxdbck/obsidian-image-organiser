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
    normalizePath,
    TAbstractFile,
    moment
} from 'obsidian';

interface SmartImagePasteSettings {
    defaultImageFolder: string;
    timeoutBeforeMoving: number;
    defaultNameFormat: string;
}

const DEFAULT_SETTINGS: SmartImagePasteSettings = {
    defaultImageFolder: '',
    timeoutBeforeMoving: 300,
    defaultNameFormat: 'image-{{date}}'
}

export default class SmartImagePastePlugin extends Plugin {
    settings: SmartImagePasteSettings;
    lastPastedImagePath: string | null = null;

    async onload() {
        await this.loadSettings();

        // Register the paste event handler
        this.registerEvent(
            this.app.workspace.on('editor-paste', this.handlePasteEvent.bind(this))
        );
        
        // Register a file created event listener to catch when our image is created
        this.registerEvent(
            this.app.vault.on('create', this.onFileCreated.bind(this))
        );

        // Add a settings tab
        this.addSettingTab(new SmartImagePasteSettingTab(this.app, this));
    }

    onunload() {
        // Clean up
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
    }

    async handlePasteEvent(evt: ClipboardEvent, editor: Editor, view: MarkdownView): Promise<void> {
        // Check if the pasted content includes an image
        const items = evt.clipboardData?.items;
        if (!items) return;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // Only handle images
            if (item.type.startsWith('image/')) {
                // Prevent default paste behavior
                evt.preventDefault();
                
                const file = item.getAsFile();
                if (!file) continue;
                
                // Try to get the original filename from the clipboard
                let suggestedName = this.getSuggestedImageName(file);
                
                // Get image title from user
                const imageTitle = await this.promptForImageTitle(suggestedName);
                if (!imageTitle) {
                    new Notice('Image paste cancelled');
                    return;
                }

                // Create a filename with the provided title
                const fileExt = this.getFileExtFromMime(item.type);
                const fileName = `${imageTitle}${fileExt}`;
                
                try {
                    // Save image
                    const path = this.settings.defaultImageFolder || '';
                    const finalPath = normalizePath(path ? path + '/' + fileName : fileName);
                    
                    // Remember the path for the file create event
                    this.lastPastedImagePath = finalPath;
                    
                    // Read file as array buffer
                    const buffer = await file.arrayBuffer();
                    
                    // Save to vault
                    await this.app.vault.createBinary(finalPath, buffer);
                    
                    // Insert image link at cursor position
                    const imageMarkdown = `![${imageTitle}](${finalPath})`;
                    editor.replaceSelection(imageMarkdown);
                    
                    // Show a status message
                    new Notice(`Image saved as "${fileName}". Opening move dialog...`);
                } catch (error) {
                    console.error('Error handling image paste:', error);
                    new Notice('Failed to process pasted image');
                    this.lastPastedImagePath = null;
                }
            }
        }
    }

    getSuggestedImageName(file: File): string {
        // Try to get the original filename if available
        let name = file.name;
        
        if (name && name !== "image.png" && name !== "image.jpg") {
            // If we have what seems like a real filename (not a generic one),
            // remove the extension
            const lastDotIndex = name.lastIndexOf('.');
            if (lastDotIndex > 0) {
                name = name.substring(0, lastDotIndex);
            }
            return name;
        }
        
        // Fall back to the default format, using the date placeholder
        return this.getDefaultImageName();
    }
    
    getDefaultImageName(): string {
        // Replace {{date}} with current date in YYYY-MM-DD format
        const date = moment().format('YYYY-MM-DD');
        const time = moment().format('HHmmss');
        
        return this.settings.defaultNameFormat
            .replace('{{date}}', date)
            .replace('{{time}}', time);
    }

    onFileCreated(file: TAbstractFile) {
        // If this is our recently pasted image, handle it
        if (this.lastPastedImagePath && file.path === this.lastPastedImagePath && file instanceof TFile) {
            // Clear the path since we're handling it now
            this.lastPastedImagePath = null;
            
            // Schedule moving the file after a short delay
            setTimeout(() => {
                this.moveImageFile(file);
            }, this.settings.timeoutBeforeMoving);
        }
    }
    
    async moveImageFile(file: TFile) {
        try {
            // Try to activate the file first
            await this.app.workspace.getLeaf().openFile(file);
            
            // Execute the move command
            this.app.commands.executeCommandById('file-explorer:move-file');
        } catch (error) {
            console.error('Error moving image file:', error);
            new Notice(`Error moving file. You can move "${file.path}" manually.`);
        }
    }

    async promptForImageTitle(defaultName: string): Promise<string | null> {
        return new Promise((resolve) => {
            const modal = new ImageTitleModal(this.app, defaultName, (result) => {
                resolve(result);
            });
            modal.open();
        });
    }

    getFileExtFromMime(mimeType: string): string {
        const mimeToExt: Record<string, string> = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/svg+xml': '.svg',
            'image/bmp': '.bmp',
            'image/tiff': '.tiff'
        };
        
        return mimeToExt[mimeType] || '.png';
    }
}

class ImageTitleModal extends Modal {
    private result: string | null = null;
    private onSubmit: (result: string | null) => void;
    private inputEl: HTMLInputElement;
    private defaultName: string;

    constructor(app: App, defaultName: string, onSubmit: (result: string | null) => void) {
        super(app);
        this.defaultName = defaultName;
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        
        contentEl.createEl('h2', { text: 'Enter Image Title' });
        
        // Create input field with default name
        this.inputEl = contentEl.createEl('input', {
            type: 'text',
            value: this.defaultName,
            placeholder: 'Image title',
            attr: { autofocus: true }
        });
        
        // Focus input and select all
        this.inputEl.focus();
        this.inputEl.select();
        
        // Listen for Enter key
        this.inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.result = this.inputEl.value;
                this.close();
            }
        });
        
        // Create buttons
        const buttonDiv = contentEl.createDiv({ cls: 'modal-button-container' });
        
        // Cancel button
        buttonDiv.createEl('button', { text: 'Cancel' })
            .addEventListener('click', () => {
                this.close();
            });
        
        // Submit button
        const submitButton = buttonDiv.createEl('button', { 
            text: 'Save',
            cls: 'mod-cta'
        });
        submitButton.addEventListener('click', () => {
            this.result = this.inputEl.value;
            this.close();
        });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
        this.onSubmit(this.result);
    }
}

class SmartImagePasteSettingTab extends PluginSettingTab {
    plugin: SmartImagePastePlugin;

    constructor(app: App, plugin: SmartImagePastePlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Smart Image Paste Settings' });

        new Setting(containerEl)
            .setName('Default image folder')
            .setDesc('Where to initially save images before moving. Leave empty for root folder.')
            .addText(text => text
                .setPlaceholder('e.g., Attachments/Images/')
                .setValue(this.plugin.settings.defaultImageFolder)
                .onChange(async (value) => {
                    this.plugin.settings.defaultImageFolder = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Timeout before moving')
            .setDesc('Milliseconds to wait before opening the move dialog (adjust if needed)')
            .addSlider(slider => slider
                .setLimits(100, 1000, 50)
                .setValue(this.plugin.settings.timeoutBeforeMoving)
                .setDynamicTooltip()
                .onChange(async (value) => {
                    this.plugin.settings.timeoutBeforeMoving = value;
                    await this.plugin.saveSettings();
                }));
                
        new Setting(containerEl)
            .setName('Default image name format')
            .setDesc('Format to use when original filename is not available. Use {{date}} and {{time}} as placeholders.')
            .addText(text => text
                .setPlaceholder('image-{{date}}')
                .setValue(this.plugin.settings.defaultNameFormat)
                .onChange(async (value) => {
                    this.plugin.settings.defaultNameFormat = value;
                    await this.plugin.saveSettings();
                }));
    }
}
