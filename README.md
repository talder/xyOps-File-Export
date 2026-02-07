<p align="center"><img src="https://raw.githubusercontent.com/talder/xyOps-File-Export/refs/heads/main/logo.png" height="108" alt="Logo"/></p>
<h1 align="center">xyOps File Export</h1>

# xyOps File Export Plugin

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/talder/xyOps-File-Export/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-14.0+-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20macOS-lightgrey.svg)]()

A versatile xyOps Action Plugin that exports job output data to multiple file formats including JSON, CSV, HTML, XML, Markdown, YAML, Plain Text, Excel, PDF, and HL7 healthcare formats.

## ⚠️ Disclaimer

**USE AT YOUR OWN RISK.** This software is provided "as is", without warranty of any kind, express or implied. The author and contributors are not responsible for any damages, data loss, or other issues that may arise from the use of this software. Always test in non-production environments first. By using this plugin, you acknowledge that you have read, understood, and accepted this disclaimer.

## Important Warnings

### ⚠️ DELETE Folder Option - DANGEROUS!

This plugin includes a **"DELETE all files"** folder cleanup option that will **permanently remove ALL files** in the specified output folder before generating a new export.

**THIS ACTION CANNOT BE UNDONE!**

- Triple-check the output folder path before enabling this option
- Never use on folders containing important data
- Consider using the safer "Move to OLD subfolder" option instead
- The plugin only deletes **files**, not subdirectories

### 📦 Automatic Module Installation

When using **Excel (.xlsx)** or **PDF (.pdf)** export formats, the plugin will **automatically install** the required npm packages (`exceljs` and `pdfkit`) if they are not already present.

- Installation happens on first use of these formats
- Requires internet connectivity on the xyOps Satellite server
- First export may take 30-60 seconds while packages download
- Packages are installed in the plugin directory
- Subsequent exports will be instant

If automatic installation fails, manually install:
```bash
cd /path/to/xyOps-File-Export
npm install exceljs pdfkit
```

## Quick Start

1. **Install the plugin** in xyOps (copy to plugins directory or install from Marketplace)
2. **Create a workflow** with a job that outputs data
3. **Add the File Export action** to the job's success actions
4. **Configure parameters** (format, filename, location)
5. **Run the workflow** - your data is exported!

## Features

### Supported Export Formats

| Format | Extension | Description | Dependencies |
|--------|-----------|-------------|--------------|
| **JSON** | `.json` | Pretty-printed JSON | None |
| **CSV** | `.csv` | Comma-separated values | None |
| **HTML** | `.html` | Styled HTML table with CSS | None |
| **XML** | `.xml` | Structured XML document | None |
| **Markdown** | `.md` | Markdown table format | None |
| **YAML** | `.yaml` | YAML format | None |
| **Plain Text** | `.txt` | ASCII table format | None |
| **Excel** | `.xlsx` | Microsoft Excel workbook | `exceljs` (auto-installed) |
| **PDF** | `.pdf` | PDF document with table | `pdfkit` (auto-installed) |
| **HL7 v2.x** | `.hl7` | HL7 v2 pipe-delimited message | None |
| **HL7 FHIR** | `.fhir.json` | FHIR Bundle with Observations | None |

### Core Features

- **Cross-Platform** - Works on Linux, Windows, and macOS
- **Multiple Data Sources** - Handles `job.data`, `job.output`, and raw stdout
- **Nested Object Flattening** - Automatically flattens nested objects for CSV/HTML
- **Flexible Filenames** - Optional timestamp and unique ID suffixes
- **Folder Management** - Create folders, archive old files, or clean up

### Advanced Features

- **Custom Report Titles** - Set custom titles for HTML/Markdown/PDF reports
- **Folder Cleanup Options** - Keep, archive to OLD/, or delete existing files
- **Automatic Dependency Installation** - Excel and PDF libraries install on demand
- **Debug Logging** - Detailed logging in job output for troubleshooting

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| **Output Format** | Menu | `json` | Select the export file format |
| **Filename** | Text | `export` | Base filename (extension added automatically) |
| **File Location** | Text | (job temp) | Directory path for the output file |
| **Add Timestamp** | Checkbox | `true` | Append timestamp (YYYYMMDD_HHmmss) to filename |
| **Add Unique ID** | Checkbox | `false` | Append 8-character unique identifier |
| **Report Title** | Text | (filename) | Custom title for HTML/Markdown/PDF reports |
| **Create Folder** | Checkbox | `true` | Auto-create output folder if missing |
| **Folder Cleanup** | Menu | `keep` | Keep files, archive to OLD/, or DELETE all |

## Output Filename Examples

With filename `report`:

| Timestamp | UID | Result |
|-----------|-----|--------|
| ✅ | ❌ | `report_20260207_143052.json` |
| ❌ | ✅ | `report_a1b2c3d4.json` |
| ✅ | ✅ | `report_20260207_143052_a1b2c3d4.json` |
| ❌ | ❌ | `report.json` |

## Installation

### From xyOps Marketplace

1. Navigate to xyOps Marketplace
2. Search for "File Export"
3. Click Install

### Manual Installation

1. Clone or download this repository
2. Copy the plugin folder to your xyOps plugins directory
3. Restart xyOps or refresh the plugins list

```bash
cd /opt/xyops/plugins
git clone https://github.com/talder/xyOps-File-Export.git
```

## Usage Examples

### Basic JSON Export

Configure the action with:
- **Output Format:** JSON
- **Filename:** `server_data`
- **File Location:** `/exports/daily`
- **Add Timestamp:** ✅

Result: `/exports/daily/server_data_20260207_143052.json`

### HTML Report with Custom Title

Configure the action with:
- **Output Format:** HTML
- **Filename:** `health_report`
- **Report Title:** `Server Health Report - February 2026`
- **File Location:** `/reports`

### Archive Previous Reports

Configure the action with:
- **Output Format:** PDF
- **Filename:** `monthly_report`
- **File Location:** `/reports/monthly`
- **Folder Cleanup:** Move to OLD subfolder

Previous files are moved to `/reports/monthly/OLD/` before creating the new report.

## Creating Structured Output Data

By default, shell scripts output plain text which is captured as raw stdout. For better export results (especially CSV, Excel, HTML), output structured JSON data from your scripts.

### Example: Converting `ls -lart` to Structured JSON

Create a shell script that outputs JSON instead of plain text:

```bash
#!/bin/bash

# xyOps Shell Script: ls -lart to JSON
# Outputs structured JSON data for downstream actions

json_array="["
first=true

while IFS= read -r line; do
    # Skip empty lines and "total" line
    [[ -z "$line" ]] && continue
    [[ "$line" =~ ^total ]] && continue
    
    # Parse ls -l output columns using awk
    perms=$(echo "$line" | awk '{print $1}')
    links=$(echo "$line" | awk '{print $2}')
    owner=$(echo "$line" | awk '{print $3}')
    group=$(echo "$line" | awk '{print $4}')
    size=$(echo "$line" | awk '{print $5}')
    month=$(echo "$line" | awk '{print $6}')
    day=$(echo "$line" | awk '{print $7}')
    time_year=$(echo "$line" | awk '{print $8}')
    name_part=$(echo "$line" | awk '{for(i=9;i<=NF;i++) printf "%s%s", $i, (i<NF?" ":""); print ""}')
    
    # Skip if parsing failed
    [[ -z "$perms" ]] && continue
    
    # Determine file type
    case "${perms:0:1}" in
        d) file_type="directory" ;;
        l) file_type="symlink" ;;
        -) file_type="file" ;;
        *) file_type="other" ;;
    esac
    
    # Handle symlinks (extract target)
    symlink_target=""
    display_name="$name_part"
    if [[ "$name_part" == *" -> "* ]]; then
        display_name="${name_part%% -> *}"
        symlink_target="${name_part#* -> }"
    fi
    
    # Build JSON object
    if [ "$first" = true ]; then
        first=false
    else
        json_array+=","
    fi
    
    json_object="{"
    json_object+="\"name\":\"$display_name\","
    json_object+="\"type\":\"$file_type\","
    json_object+="\"permissions\":\"$perms\","
    json_object+="\"links\":$links,"
    json_object+="\"owner\":\"$owner\","
    json_object+="\"group\":\"$group\","
    json_object+="\"size\":$size,"
    json_object+="\"month\":\"$month\","
    json_object+="\"day\":\"$day\","
    json_object+="\"time\":\"$time_year\""
    
    if [[ -n "$symlink_target" ]]; then
        json_object+=",\"target\":\"$symlink_target\""
    fi
    
    json_object+="}"
    json_array+="$json_object"
    
done < <(ls -lart /)

json_array+="]"

# Output to xyOps (enable "Interpret JSON in Output" in Shell Plugin!)
echo "{\"xy\":1,\"code\":0,\"description\":\"Listed items\",\"data\":$json_array}"
```

**Important:** Enable **"Interpret JSON in Output"** checkbox in the Shell Plugin parameters!

### Resulting CSV Output

```csv
name,type,permissions,links,owner,group,size,month,day,time,target
var,symlink,lrwxr-xr-x@,1,root,wheel,11,Nov,22,14:49,private/var
usr,directory,drwxr-xr-x@,11,root,wheel,352,Nov,22,14:49,
tmp,symlink,lrwxr-xr-x@,1,root,wheel,11,Nov,22,14:49,private/tmp
bin,directory,drwxr-xr-x@,39,root,wheel,1248,Nov,22,14:49,
```

### Resulting HTML Output

The HTML export creates a professionally styled table with:
- Blue header row with white text
- Hover effects on rows
- Responsive design
- Generation timestamp
- Custom report title

## Format-Specific Details

### JSON
- Pretty-printed with 2-space indentation
- Preserves original data structure

### CSV
- Automatically flattens nested objects (e.g., `meta.level` becomes column header)
- Arrays of primitives joined with commas
- Proper escaping of quotes and special characters
- First row contains headers

### HTML
- Full HTML5 document with embedded CSS
- Styled table with blue headers
- Responsive design
- Custom report title support

### XML
- Valid XML with proper declaration
- Nested objects preserved as child elements
- Special characters escaped

### YAML
- Clean YAML syntax
- Proper quoting of special strings
- Nested structures preserved

### Plain Text (TXT)
- ASCII table with aligned columns
- Header separator line
- Works in any text viewer

### Excel (XLSX)
- Styled header row (blue background, white text)
- Auto-column width
- Proper data types (numbers, strings)
- **Requires:** `exceljs` (auto-installed)

### PDF
- Professional document layout
- Title and timestamp header
- Table format for data
- Page breaks for large datasets
- **Requires:** `pdfkit` (auto-installed)

### HL7 v2.x
- Standard ORU^R01 message structure
- MSH, PID, OBR, OBX segments
- Proper field escaping
- Each data field becomes an OBX segment

### HL7 FHIR
- FHIR R4 Bundle resource
- Collection of Observation resources
- Proper coding and value types
- JSON format

## Troubleshooting

### "No input data found"

**Cause:** The previous job didn't output structured data.

**Solutions:**
1. Enable "Interpret JSON in Output" in Shell Plugin
2. Output JSON with `data` property: `{"xy":1,"code":0,"data":{...}}`
3. Check job log for "Using data from" message

### "Output folder does not exist"

**Cause:** The specified folder doesn't exist and "Create Folder" is disabled.

**Solutions:**
1. Enable "Create Folder" checkbox
2. Create the folder manually before running

### "Excel/PDF export requires..."

**Cause:** Auto-installation of dependencies failed.

**Solutions:**
1. Check internet connectivity on Satellite server
2. Install manually: `npm install exceljs pdfkit`
3. Check npm permissions in plugin directory

### Empty or incorrect output

**Cause:** Data is in unexpected location.

**Solutions:**
1. Check job log for debug messages
2. Verify "Interpret JSON in Output" is enabled for Shell Plugin
3. Check the data structure in the previous job's output

## Debug Output

The plugin logs detailed information to the job log:

```
File Export: Using data from 'job.data'
File Export: Output format: 'csv'
File Export: Converting to csv...
File Export: Conversion successful, content length: 1234
File Export: Writing to /exports/report.csv
File Export: File written successfully
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

### Ideas for Enhancements

- Data transformation options

## License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## Author

**Tim Alderweireldt**
- Plugin: xyOps File Export
- Year: 2026

## cknowledgments

- **xyOps team** - For the automation platform
- **exceljs** - For Excel file generation
- **pdfkit** - For PDF document generation

## Version History

### v1.1.0 (2026-02-07)
- Added YAML export format
- Added Plain Text (TXT) export format
- Added Excel (XLSX) export with auto-install
- Added PDF export with auto-install
- Added folder cleanup options (keep/archive/delete)
- Added Report Title parameter
- Added Create Folder option
- Improved debug logging

### v1.0.0 (2026-02-07)
- Initial release
- JSON, CSV, HTML, XML, Markdown formats
- HL7 v2.x and FHIR formats
- Timestamp and UID filename options
- Auto-upload to xyOps

---

**Need help?** Open an issue on GitHub or contact the author.

**Found this useful?** Star the repository and share with your team!
