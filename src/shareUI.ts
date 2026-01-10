// Share UI - modal dialog for sharing schedule with options

import { Schedule, PrintOptions } from './model.js';
import { copyHtmlToClipboard, copyMarkdownToClipboard } from './ui.js';

/** Show the share modal with options */
export function showShareModal(schedule: Schedule): void {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'share-modal-overlay';

  const modal = document.createElement('div');
  modal.className = 'share-modal';

  // Header
  const header = document.createElement('div');
  header.className = 'share-modal-header';
  header.innerHTML = `
    <h2>Copy Schedule As</h2>
    <button class="share-modal-close">&times;</button>
  `;

  // Content
  const content = document.createElement('div');
  content.className = 'share-modal-content';

  // Options section
  const optionsSection = document.createElement('div');
  optionsSection.className = 'share-options';

  const eventsOnlyLabel = document.createElement('label');
  eventsOnlyLabel.className = 'share-option';
  const eventsOnlyCheckbox = document.createElement('input');
  eventsOnlyCheckbox.type = 'checkbox';
  eventsOnlyCheckbox.id = 'share-events-only';
  eventsOnlyLabel.appendChild(eventsOnlyCheckbox);
  eventsOnlyLabel.appendChild(document.createTextNode(' Events only (exclude travel & personal days)'));

  const showPinnedLabel = document.createElement('label');
  showPinnedLabel.className = 'share-option';
  const showPinnedCheckbox = document.createElement('input');
  showPinnedCheckbox.type = 'checkbox';
  showPinnedCheckbox.id = 'share-show-pinned';
  showPinnedLabel.appendChild(showPinnedCheckbox);
  showPinnedLabel.appendChild(document.createTextNode(' Include pinned events'));

  optionsSection.appendChild(eventsOnlyLabel);
  optionsSection.appendChild(showPinnedLabel);

  // Buttons section
  const buttonsSection = document.createElement('div');
  buttonsSection.className = 'share-buttons';

  const htmlBtn = document.createElement('button');
  htmlBtn.className = 'share-btn';
  htmlBtn.textContent = 'Copy as HTML';

  const markdownBtn = document.createElement('button');
  markdownBtn.className = 'share-btn';
  markdownBtn.textContent = 'Copy as Markdown';

  buttonsSection.appendChild(htmlBtn);
  buttonsSection.appendChild(markdownBtn);

  // Status message
  const statusDiv = document.createElement('div');
  statusDiv.className = 'share-status';

  content.appendChild(optionsSection);
  content.appendChild(buttonsSection);
  content.appendChild(statusDiv);

  modal.appendChild(header);
  modal.appendChild(content);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);

  // Get current options
  function getOptions(): PrintOptions {
    return {
      eventsOnly: eventsOnlyCheckbox.checked,
      showPinned: showPinnedCheckbox.checked
    };
  }

  // Close modal
  function closeModal(): void {
    overlay.remove();
  }

  // Handle close button
  const closeBtn = header.querySelector('.share-modal-close')!;
  closeBtn.addEventListener('click', closeModal);

  // Handle overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal();
    }
  });

  // Handle escape key
  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeModal();
      document.removeEventListener('keydown', handleEscape);
    }
  };
  document.addEventListener('keydown', handleEscape);

  // Handle HTML button
  htmlBtn.addEventListener('click', async () => {
    const options = getOptions();
    const success = await copyHtmlToClipboard(schedule, options);
    if (success) {
      statusDiv.textContent = 'HTML copied to clipboard!';
      statusDiv.className = 'share-status success';
      setTimeout(closeModal, 1000);
    } else {
      statusDiv.textContent = 'Failed to copy HTML';
      statusDiv.className = 'share-status error';
    }
  });

  // Handle Markdown button
  markdownBtn.addEventListener('click', async () => {
    const options = getOptions();
    const success = await copyMarkdownToClipboard(schedule, options);
    if (success) {
      statusDiv.textContent = 'Markdown copied to clipboard!';
      statusDiv.className = 'share-status success';
      setTimeout(closeModal, 1000);
    } else {
      statusDiv.textContent = 'Failed to copy Markdown';
      statusDiv.className = 'share-status error';
    }
  });
}
