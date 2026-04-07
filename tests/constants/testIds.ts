export enum TestId {
  AddWidgetTrigger = 'add-widget-trigger',
  AddWidgetPreview = 'add-widget-preview',
  AddWidgetPreviewTitle = 'add-widget-preview-title',
  PinToggle = 'pin-toggle',
  SearchWidgetForm = 'search-widget-form',
  SearchWidgetInput = 'search-widget-input',
  SearchWidgetSubmit = 'search-widget-submit',
  TodoAddDialog = 'todo-add-dialog',
  TodoTitleInput = 'todo-title-input',
  TodoDescriptionInput = 'todo-description-input',
  TodoTabSelect = 'todo-tab-select',
  TodoAttachTab = 'todo-attach-tab',
  TodoSubmit = 'todo-submit',
  TodoToggleCompleted = 'todo-toggle-completed',
  TodoToggleDeleted = 'todo-toggle-deleted',
  TodoOpenAdd = 'todo-open-add',
  TodoOpenSettings = 'todo-open-settings',
  ChromeLibrarySearch = 'chrome-library-search',
  ChromeLibraryOpenSettings = 'chrome-library-open-settings',
  ChromeLibraryModeGroups = 'chrome-library-mode-groups',
  ChromeLibraryModeBookmarks = 'chrome-library-mode-bookmarks',
  ChromeLibrarySettingsDialog = 'chrome-library-settings-dialog',
  ChromeLibrarySettingsSectioned = 'chrome-library-settings-sectioned',
  ChromeLibrarySettingsCombined = 'chrome-library-settings-combined',
}

export enum TestIdPrefix {
  AddWidgetItem = 'add-widget-item',
  AddWidgetButton = 'add-widget-button',
  WidgetFrame = 'widget-frame',
  WidgetRemove = 'widget-remove',
  WidgetDrag = 'widget-drag',
  WidgetContent = 'widget-content',
  TodoTask = 'todo-task',
  TodoComplete = 'todo-complete',
  TodoDelete = 'todo-delete',
  TodoOpenLinkedTab = 'todo-open-linked-tab',
}

function prefixed(prefix: TestIdPrefix, value: string) {
  return `${prefix}-${value}`
}

export const testIds = {
  addWidgetItem: (widgetType: string) => prefixed(TestIdPrefix.AddWidgetItem, widgetType),
  addWidgetButton: (widgetType: string) => prefixed(TestIdPrefix.AddWidgetButton, widgetType),
  widgetFrame: (widgetType: string) => prefixed(TestIdPrefix.WidgetFrame, widgetType),
  widgetRemove: (widgetType: string) => prefixed(TestIdPrefix.WidgetRemove, widgetType),
  widgetDrag: (widgetType: string) => prefixed(TestIdPrefix.WidgetDrag, widgetType),
  widgetContent: (widgetType: string) => prefixed(TestIdPrefix.WidgetContent, widgetType),
  todoTask: (taskId: string) => prefixed(TestIdPrefix.TodoTask, taskId),
  todoComplete: (taskId: string) => prefixed(TestIdPrefix.TodoComplete, taskId),
  todoDelete: (taskId: string) => prefixed(TestIdPrefix.TodoDelete, taskId),
  todoOpenLinkedTab: (taskId: string) => prefixed(TestIdPrefix.TodoOpenLinkedTab, taskId),
}
