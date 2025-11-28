# DCS Reference UI Update Plan

## Changes Needed:

1. Remove duplicate `searchQuery` state (line 33)
2. Remove Last Sync from stats display (not persisted)
3. Remove filter dropdowns section entirely
4. Move "Showing X of X units" to same line as header
5. Add filter icons to column headers (Category, Sub-Category, Kill Type, Status, Source)
6. Add sorting to Display Name and Type Name columns
7. Add search box in header row

## New Layout:
```
Unit Database Sync [stats] [drag/drop area]

Unit Type Browser        [Search box]        Showing X of X        [+ Add Unit]
+----------------------------------------------------------------+
| Display ↕ | Type ↕ | Category ⚑ | Sub-Cat ⚑ | Kill ⚑ | Source ⚑ | Status ⚑ | Actions |
+----------------------------------------------------------------+
```

## Filter Dropdown Pattern (from DiscordPilotsDialog):
- Position absolute, top 100%, left 0
- White background, border, shadow
- Checkboxes for multi-select
- Close on outside click
