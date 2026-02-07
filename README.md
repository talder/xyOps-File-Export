<p align="center"><img src="https://raw.githubusercontent.com/talder/xyOps-File-Export/refs/heads/main/logo.png" height="108" alt="Logo"/></p>
<h1 align="center">xyOps File Export</h1>

# xyOps File Export Plugin

[![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)](https://github.com/talder/xyOps-File-Export/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-14.0+-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20Windows%20%7C%20macOS-lightgrey.svg)]()

A versatile xyOps Action Plugin that exports job output data to multiple file formats including JSON, CSV, HTML, XML, Markdown, YAML, Plain Text, Excel, PDF, and HL7 healthcare formats. Now with powerful **data transformation** capabilities!

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

When using **Excel (.xlsx)**, **PDF (.pdf)** export formats, or **Data Transforms (YAML)**, the plugin will **automatically install** the required npm packages (`exceljs`, `pdfkit`, `js-yaml`) if they are not already present.

- Installation happens on first use of these formats
- Requires internet connectivity on the xyOps Satellite server
- First export may take 30-60 seconds while packages download
- Packages are installed in the plugin directory
- Subsequent exports will be instant

If automatic installation fails, manually install:
```bash
cd /path/to/xyOps-File-Export
npm install exceljs pdfkit js-yaml
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

- **Data Transforms** - 20 transform types: filter, select, rename, sort, compute, group, mask, and more!
- **Custom Report Titles** - Set custom titles for HTML/Markdown/PDF reports
- **Folder Cleanup Options** - Keep, archive to OLD/, or delete existing files
- **Automatic Dependency Installation** - Excel, PDF, and YAML libraries install on demand
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
| **Data Transforms** | Code (YAML) | (empty) | Optional YAML configuration for data transformations |

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

## Data Transforms

The plugin supports powerful data transformations using YAML configuration. Transforms are applied as a **pipeline** - each step processes the output of the previous step, in order.

### Transform Types

**Core Transforms:**
| Transform | Description | Works On |
|-----------|-------------|----------|
| `filter` | Keep rows matching a condition | Arrays |
| `select` | Keep only specified fields | Arrays & Objects |
| `exclude` | Remove specified fields | Arrays & Objects |
| `rename` | Rename field names | Arrays & Objects |
| `sort` | Sort rows by field | Arrays |
| `format` | Format field values (dates, numbers, etc.) | Arrays & Objects |

**Data Manipulation:**
| Transform | Description | Works On |
|-----------|-------------|----------|
| `limit` | Keep only first N rows | Arrays |
| `skip` | Skip first N rows | Arrays |
| `reverse` | Reverse row order | Arrays |
| `distinct` | Remove duplicate rows | Arrays |
| `flatten` | Flatten nested objects to dot-notation | Arrays & Objects |

**Computed Fields:**
| Transform | Description | Works On |
|-----------|-------------|----------|
| `compute` | Add calculated fields with expressions | Arrays & Objects |
| `concat` | Combine multiple fields into one | Arrays & Objects |
| `split` | Split one field into multiple | Arrays & Objects |
| `lookup` | Map values using a lookup table | Arrays & Objects |

**Aggregation:**
| Transform | Description | Works On |
|-----------|-------------|----------|
| `group` | Group by field with aggregations (sum, avg, count, etc.) | Arrays |
| `summarize` | Add a summary row with totals | Arrays |

**String Operations:**
| Transform | Description | Works On |
|-----------|-------------|-----------|
| `truncate` | Limit string length with ellipsis | Arrays & Objects |
| `pad` | Pad strings to fixed width | Arrays & Objects |
| `mask` | Mask sensitive data (email, phone, card, etc.) | Arrays & Objects |

**Advanced Transforms:**
| Transform | Description | Works On |
|-----------|-------------|-----------|
| `unwind` | Explode array field into multiple rows | Arrays |
| `addIndex` | Add row number field to data | Arrays |
| `coalesce` | First non-null value from multiple fields | Arrays & Objects |
| `if` | Conditional field assignment | Arrays & Objects |
| `set` | Set field to fixed value or expression | Arrays & Objects |

### YAML Structure

Transforms are defined as an array of steps under the `transforms` key:

```yaml
transforms:
  - filter: "status == 'active'"
  - select:
      - name
      - email
      - created_at
  - rename:
      created_at: "Registration Date"
  - sort: "name asc"
```

### Transform Reference

#### filter - Keep Matching Rows

Keep only rows where the condition is true. Supports operators: `==`, `!=`, `>`, `<`, `>=`, `<=`, `contains`, `startswith`, `endswith`.

```yaml
transforms:
  # Basic equality
  - filter: "status == 'active'"
  
  # Numeric comparison
  - filter: "age >= 18"
  
  # Not equal
  - filter: "type != 'test'"
  
  # String contains (case-insensitive)
  - filter: "name contains 'john'"
  
  # String starts with
  - filter: "email startswith 'admin'"
  
  # String ends with
  - filter: "filename endswith '.pdf'"
  
  # Nested field access
  - filter: "user.role == 'admin'"
  
  # Boolean values
  - filter: "enabled == true"
  
  # Null check
  - filter: "deleted_at == null"
```

#### select - Keep Only Specified Fields

Keep only the listed fields, remove all others.

```yaml
transforms:
  - select:
      - id
      - name
      - email
      - created_at
```

#### exclude - Remove Specified Fields

Remove the listed fields, keep all others.

```yaml
transforms:
  - exclude:
      - password
      - internal_id
      - _metadata
```

#### rename - Rename Fields

Rename fields for better readability in reports.

```yaml
transforms:
  - rename:
      created_at: "Created Date"
      updated_at: "Last Modified"
      usr_name: "Username"
      email_addr: "Email Address"
```

#### sort - Sort Data

Sort rows by a field. Use `asc` (ascending, default) or `desc` (descending).

```yaml
transforms:
  # Simple sort (ascending)
  - sort: "name"
  
  # Explicit ascending
  - sort: "created_at asc"
  
  # Descending (newest first)
  - sort: "created_at desc"
  
  # Object syntax (alternative)
  - sort:
      field: "score"
      order: desc
```

#### format - Format Field Values

Format field values for display. Supports multiple format types.

**Date Formatting:**
```yaml
transforms:
  - format:
      created_at:
        type: date
        pattern: "DD/MM/YYYY"        # European format
      updated_at:
        type: date
        pattern: "YYYY-MM-DD HH:mm"  # ISO with time
```

Supported date patterns: `YYYY` (year), `MM` (month), `DD` (day), `HH` (hours), `mm` (minutes), `ss` (seconds)

**Number Formatting:**
```yaml
transforms:
  - format:
      price:
        type: number
        decimals: 2
        prefix: "$"
      percentage:
        type: number
        decimals: 1
        suffix: "%"
      quantity:
        type: number
        decimals: 0
        thousands: true   # Add thousand separators (1,000)
```

**String Formatting:**
```yaml
transforms:
  - format:
      name:
        type: uppercase
      email:
        type: lowercase
      description:
        type: trim
```

**Boolean Formatting:**
```yaml
transforms:
  - format:
      is_active:
        type: boolean
        true: "Yes"
        false: "No"
      enabled:
        type: boolean
        true: "✓"
        false: "✗"
```

**Default Values (replace null/empty):**
```yaml
transforms:
  - format:
      notes:
        type: default
        value: "N/A"
      department:
        type: default
        value: "Unassigned"
```

**String Replace:**
```yaml
transforms:
  - format:
      status:
        type: replace
        search: "_"         # Search pattern (regex)
        replacement: " "    # Replace with
        flags: "g"          # Regex flags (g=global)
```

---

### Data Manipulation Transforms

#### limit - Keep First N Rows

Keep only the first N rows of data.

```yaml
transforms:
  # Keep top 10 results
  - limit: 10
  
  # Combine with sort for "top N"
  - sort: "score desc"
  - limit: 5
```

#### skip - Skip First N Rows

Skip the first N rows (useful for pagination or skipping headers).

```yaml
transforms:
  # Skip first row (e.g., header row in imported data)
  - skip: 1
  
  # Pagination: get rows 11-20
  - skip: 10
  - limit: 10
```

#### reverse - Reverse Row Order

Reverse the order of all rows.

```yaml
transforms:
  # Reverse chronological order
  - reverse: true
```

#### distinct - Remove Duplicates

Remove duplicate rows based on all fields or specific fields.

```yaml
transforms:
  # Remove exact duplicate rows
  - distinct: true
  
  # Remove duplicates by single field
  - distinct: "email"
  
  # Remove duplicates by multiple fields
  - distinct:
      - customer_id
      - order_date
```

#### flatten - Flatten Nested Objects

Convert nested objects to flat structure with dot-notation keys.

```yaml
transforms:
  # Default separator (dot)
  - flatten: true
  
  # Custom separator
  - flatten:
      separator: "_"
```

Input: `{"user": {"name": "John", "address": {"city": "NYC"}}}`
Output: `{"user.name": "John", "user.address.city": "NYC"}`

---

### Computed Field Transforms

#### compute - Add Calculated Fields

Add new fields with calculated values using expressions.

```yaml
transforms:
  - compute:
      # Basic math
      total: "price * quantity"
      
      # With constants
      tax: "price * 0.21"
      
      # Multiple fields
      profit: "revenue - cost"
      margin: "(revenue - cost) / revenue * 100"
```

#### concat - Combine Fields

Combine multiple fields into a new field.

```yaml
transforms:
  # Combine with space (default)
  - concat:
      field: "full_name"
      fields:
        - first_name
        - last_name
  
  # Custom separator
  - concat:
      field: "address"
      fields:
        - street
        - city
        - country
      separator: ", "
```

#### split - Split Field into Multiple

Split a field into multiple fields.

```yaml
transforms:
  # Split name into parts
  - split:
      field: "full_name"
      separator: " "
      into:
        - first_name
        - last_name
  
  # Split CSV values
  - split:
      field: "tags"
      separator: ","
      into:
        - tag1
        - tag2
        - tag3
```

#### lookup - Map Values

Replace values using a lookup table (code-to-label mapping).

```yaml
transforms:
  # Map status codes to labels
  - lookup:
      field: "status"
      map:
        "1": "Active"
        "2": "Pending"
        "3": "Inactive"
        "0": "Deleted"
      default: "Unknown"
  
  # Map to different target field
  - lookup:
      field: "country_code"
      target: "country_name"
      map:
        "US": "United States"
        "UK": "United Kingdom"
        "DE": "Germany"
```

---

### Aggregation Transforms

#### group - Group and Aggregate

Group rows by field(s) and calculate aggregations.

```yaml
transforms:
  # Simple group with count
  - group:
      by: "department"
  
  # Group by multiple fields
  - group:
      by:
        - department
        - year
  
  # With aggregations
  - group:
      by: "category"
      aggregations:
        total_sales:
          op: sum
          field: "amount"
        avg_price:
          op: avg
          field: "price"
        order_count:
          op: count
          field: "order_id"
        min_price:
          op: min
          field: "price"
        max_price:
          op: max
          field: "price"
        first_date:
          op: first
          field: "order_date"
        all_products:
          op: list
          field: "product_name"
```

Supported aggregation operations: `sum`, `avg`, `count`, `min`, `max`, `first`, `last`, `list`

#### summarize - Add Summary Row

Add a summary/totals row at the end of the data.

```yaml
transforms:
  - summarize:
      label:
        name: "TOTAL"
      fields:
        quantity: sum
        amount: sum
        price: avg
```

---

### String Operation Transforms

#### truncate - Limit String Length

Truncate long strings with ellipsis.

```yaml
transforms:
  # Simple: field name to max length
  - truncate:
      description: 50
      notes: 100
  
  # Advanced: custom suffix
  - truncate:
      description:
        length: 50
        suffix: "..."
      title:
        length: 30
        suffix: " [more]"
```

#### pad - Pad Strings

Pad strings to fixed width.

```yaml
transforms:
  - pad:
      # Pad numbers with zeros (left)
      employee_id:
        length: 6
        char: "0"
        side: left
      
      # Pad text (right)
      name:
        length: 20
        char: " "
        side: right
```

#### mask - Mask Sensitive Data

Mask sensitive information for privacy/security.

```yaml
transforms:
  - mask:
      # Email: jo**@example.com
      email:
        type: email
      
      # Phone: ******1234
      phone:
        type: phone
      
      # Credit card: ************1234
      card_number:
        type: card
      
      # Full mask: ********
      password:
        type: full
      
      # Custom: show first 2 and last 2 chars
      ssn:
        type: custom
        showStart: 2
        showEnd: 2
        char: "*"
```

Mask types:
- `email` - Shows first 2 chars of local part + domain
- `phone` - Shows last 4 digits
- `card` - Shows last 4 digits
- `full` - Masks entire value
- `custom` - Custom start/end reveal

#### unwind - Explode Array into Rows

Expand array field values into separate rows (like MongoDB's $unwind).

```yaml
transforms:
  # Input: [{id: 1, tags: ["a", "b"]}, {id: 2, tags: ["c"]}]
  # Output: [{id: 1, tags: "a"}, {id: 1, tags: "b"}, {id: 2, tags: "c"}]
  - unwind: tags
  
  # With options: preserve rows with empty arrays
  - unwind:
      field: items
      preserveEmpty: true
```

Use cases:
- Expand order items into separate rows for reporting
- Flatten nested arrays for CSV export
- Create one row per tag/category for analysis

#### addIndex - Add Row Numbers

Add a sequential index/row number field to data.

```yaml
transforms:
  # Simple: adds "_index" field starting at 1
  - addIndex: row_number
  
  # With options
  - addIndex:
      field: "line_no"
      start: 1000
```

Use cases:
- Add line numbers to exported reports
- Create unique identifiers for rows
- Track original row order after sorting

#### coalesce - First Non-Null Value

Return the first non-null, non-empty value from multiple fields.

```yaml
transforms:
  # Use primary_email, fall back to secondary_email, then default
  - coalesce:
      field: contact_email
      fields:
        - primary_email
        - secondary_email
        - backup_email
      default: "no-email@example.com"
  
  # Get the best available phone number
  - coalesce:
      field: phone
      fields:
        - mobile_phone
        - work_phone
        - home_phone
```

Use cases:
- Merge multiple contact fields into one
- Fall back to alternative data sources
- Handle incomplete data gracefully

#### if - Conditional Field Assignment

Set a field value based on a condition.

```yaml
transforms:
  # Simple condition with literal values
  - if:
      field: status_label
      condition: "status == 'active'"
      then: "Active User"
      else: "Inactive User"
  
  # Use field references with $
  - if:
      field: display_name
      condition: "nickname != null"
      then: $nickname
      else: $full_name
  
  # Numeric comparison
  - if:
      field: priority
      condition: "score >= 80"
      then: "High"
      else: "Normal"
  
  # Chain multiple conditions
  - if:
      field: tier
      condition: "revenue >= 100000"
      then: "Enterprise"
      else: "Standard"
  - if:
      field: tier
      condition: "revenue >= 500000"
      then: "Premium"
```

Use cases:
- Categorize data based on values
- Set display labels based on conditions
- Create computed status fields

#### set - Set Fixed Values

Set fields to fixed values or special expressions.

```yaml
transforms:
  # Set literal values
  - set:
      source: "xyOps Export"
      version: "1.0"
      department: "IT"
  
  # Special values
  - set:
      exported_at: $now        # ISO timestamp: 2026-02-07T14:30:00.000Z
      export_date: $today      # Date only: 2026-02-07
      timestamp: $timestamp    # Unix timestamp: 1738939800000
  
  # Copy from another field
  - set:
      backup_email: $primary_email
      full_address: $address.street
```

Special values:
- `$now` - Current ISO timestamp
- `$today` - Current date (YYYY-MM-DD)
- `$timestamp` - Unix timestamp in milliseconds
- `$fieldname` - Copy value from another field

Use cases:
- Add metadata fields to exports
- Stamp data with export timestamp
- Copy/duplicate field values
- Set default values for all rows

---

### Complete Transform Examples

#### Example 1: User Report

Filter active users, select relevant fields, format dates, sort by name:

```yaml
transforms:
  # Step 1: Keep only active users
  - filter: "status == 'active'"
  
  # Step 2: Select fields for report
  - select:
      - name
      - email
      - department
      - created_at
      - last_login
  
  # Step 3: Rename for readability
  - rename:
      created_at: "Registered"
      last_login: "Last Login"
  
  # Step 4: Format dates
  - format:
      Registered:
        type: date
        pattern: "DD/MM/YYYY"
      Last Login:
        type: date
        pattern: "DD/MM/YYYY HH:mm"
  
  # Step 5: Sort alphabetically
  - sort: "name asc"
```

#### Example 2: Sales Report

Process sales data with amounts and dates:

```yaml
transforms:
  # Filter completed sales from this year
  - filter: "status == 'completed'"
  
  # Remove internal fields
  - exclude:
      - internal_id
      - _metadata
      - processing_notes
  
  # Rename columns
  - rename:
      cust_name: "Customer"
      total_amt: "Total"
      sale_date: "Date"
  
  # Format for display
  - format:
      Total:
        type: number
        decimals: 2
        prefix: "$"
        thousands: true
      Date:
        type: date
        pattern: "DD MMM YYYY"
  
  # Sort by date descending (newest first)
  - sort: "Date desc"
```

#### Example 3: Server Health Check

Clean up and format server status data:

```yaml
transforms:
  # Only show servers with issues
  - filter: "health_score < 80"
  
  # Select monitoring fields
  - select:
      - hostname
      - ip_address
      - health_score
      - cpu_usage
      - memory_usage
      - last_check
      - is_critical
  
  # Friendly names
  - rename:
      hostname: "Server"
      ip_address: "IP"
      health_score: "Health %"
      cpu_usage: "CPU %"
      memory_usage: "Memory %"
      last_check: "Last Checked"
      is_critical: "Critical?"
  
  # Format values
  - format:
      "Health %":
        type: number
        decimals: 0
        suffix: "%"
      "CPU %":
        type: number
        decimals: 1
        suffix: "%"
      "Memory %":
        type: number
        decimals: 1
        suffix: "%"
      "Last Checked":
        type: date
        pattern: "HH:mm:ss"
      "Critical?":
        type: boolean
        true: "⚠️ YES"
        false: "No"
  
  # Worst health first
  - sort: "Health % asc"
```

#### Example 4: Simple Field Cleanup

Just rename and reorder fields:

```yaml
transforms:
  - select:
      - first_name
      - last_name
      - email
      - phone
  - rename:
      first_name: "First Name"
      last_name: "Last Name"
      email: "Email"
      phone: "Phone"
```

### Transform Errors

If a transform fails, the job will fail with an error message. Common errors:

- **Invalid filter condition** - Check syntax: `field operator 'value'`
- **Unknown transform type** - Check spelling. Valid types: filter, select, exclude, rename, sort, format, limit, skip, reverse, distinct, flatten, compute, concat, split, lookup, group, summarize, truncate, pad, mask
- **select requires fields** - Provide a list of field names
- **sort requires a field** - Specify which field to sort by

Debug output shows each transform step:
```
File Export: Applying 4 transform(s)...
File Export: Step 1: filter
File Export: filter 'status == active' - 100 rows → 75 rows
File Export: Step 2: select
File Export: select fields [name, email, status]
File Export: Step 3: rename
File Export: rename fields [status→Status]
File Export: Step 4: sort
File Export: sort by 'name' asc
File Export: All transforms completed
File Export: Data after transforms: 75 rows
```

---

## Regex Quick Reference

Some transforms use **regular expressions (regex)** for pattern matching. Here's a quick guide to help you use them effectively.

### Where Regex is Used

- **format** transform with `type: replace` - the `search` field uses regex
- Filter operators `contains`, `startswith`, `endswith` use simple string matching (not regex)

### Basic Patterns

| Pattern | Matches | Example |
|---------|---------|----------|
| `abc` | Exact text "abc" | `"abc"` matches "abc" |
| `.` | Any single character | `"a.c"` matches "abc", "a1c", "a-c" |
| `.*` | Any characters (zero or more) | `"a.*c"` matches "ac", "abc", "aXXXc" |
| `.+` | Any characters (one or more) | `"a.+c"` matches "abc", "aXXXc" (not "ac") |
| `?` | Previous char is optional | `"colou?r"` matches "color" and "colour" |

### Character Classes

| Pattern | Matches | Example |
|---------|---------|----------|
| `[abc]` | Any one of a, b, or c | `"[aeiou]"` matches any vowel |
| `[a-z]` | Any lowercase letter | `"[a-z]+"` matches "hello" |
| `[A-Z]` | Any uppercase letter | `"[A-Z]+"` matches "HELLO" |
| `[0-9]` | Any digit | `"[0-9]+"` matches "123" |
| `[^abc]` | NOT a, b, or c | `"[^0-9]"` matches non-digits |

### Shortcuts

| Pattern | Matches | Same As |
|---------|---------|----------|
| `\d` | Any digit | `[0-9]` |
| `\D` | Any non-digit | `[^0-9]` |
| `\w` | Word character | `[a-zA-Z0-9_]` |
| `\W` | Non-word character | `[^a-zA-Z0-9_]` |
| `\s` | Whitespace | space, tab, newline |
| `\S` | Non-whitespace | anything but space/tab/newline |

### Anchors

| Pattern | Matches |
|---------|----------|
| `^` | Start of string |
| `$` | End of string |
| `\b` | Word boundary |

### Quantifiers

| Pattern | Matches |
|---------|----------|
| `*` | 0 or more times |
| `+` | 1 or more times |
| `?` | 0 or 1 time |
| `{3}` | Exactly 3 times |
| `{2,5}` | 2 to 5 times |
| `{2,}` | 2 or more times |

### Special Characters (Must Escape)

These characters have special meaning. To match them literally, add `\` before them:

```
.  *  +  ?  ^  $  |  \  [  ]  (  )  {  }
```

Example: To match `$100.00`, use `\$100\.00`

### Flags

Used in the `flags` parameter of format replace:

| Flag | Meaning |
|------|----------|
| `g` | Global - replace ALL matches (not just first) |
| `i` | Case-insensitive matching |
| `gi` | Both global and case-insensitive |

### Practical Examples for File Export

**Remove all digits:**
```yaml
- format:
    product_code:
      type: replace
      search: "[0-9]"
      replacement: ""
      flags: "g"
```

**Replace underscores with spaces:**
```yaml
- format:
    field_name:
      type: replace
      search: "_"
      replacement: " "
      flags: "g"
```

**Remove special characters:**
```yaml
- format:
    filename:
      type: replace
      search: "[^a-zA-Z0-9]"
      replacement: ""
      flags: "g"
```

**Extract numbers only:**
```yaml
- format:
    phone:
      type: replace
      search: "\\D"    # Note: double backslash in YAML
      replacement: ""
      flags: "g"
```

**Clean up multiple spaces:**
```yaml
- format:
    text:
      type: replace
      search: "\\s+"   # One or more whitespace
      replacement: " "
      flags: "g"
```

**Remove HTML tags:**
```yaml
- format:
    content:
      type: replace
      search: "<[^>]+>"
      replacement: ""
      flags: "g"
```

**Format phone number (add dashes):**
```yaml
# First remove non-digits, then use compute or keep as-is
- format:
    phone:
      type: replace
      search: "(\\d{3})(\\d{3})(\\d{4})"
      replacement: "$1-$2-$3"
```

### Common Patterns Cheat Sheet

| What to Match | Pattern |
|---------------|----------|
| Email (simple) | `[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}` |
| Phone digits | `\d{10}` or `\d{3}-\d{3}-\d{4}` |
| Date YYYY-MM-DD | `\d{4}-\d{2}-\d{2}` |
| IP Address (simple) | `\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}` |
| URL (simple) | `https?://[^\s]+` |
| Alphanumeric only | `^[a-zA-Z0-9]+$` |
| Has whitespace | `\s` |
| Empty or whitespace | `^\s*$` |

### YAML Escaping Note

In YAML, backslashes need to be doubled. So:
- `\d` in regex becomes `"\\d"` in YAML
- `\s` in regex becomes `"\\s"` in YAML
- `\.` in regex becomes `"\\."` in YAML

Alternatively, use single quotes which don't need escaping:
```yaml
search: '\d+'    # Works with single quotes
```

---

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

- Template-based output formatting
- Data validation transforms
- Pivot/unpivot transforms

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

### v1.4.0 (2026-02-07)
- **5 NEW Advanced Transforms!** Now 25 total transforms available
- `unwind` - Explode array fields into multiple rows (like MongoDB $unwind)
- `addIndex` - Add row numbers/sequence field to data
- `coalesce` - Get first non-null value from multiple fields
- `if` - Conditional field assignment with then/else
- `set` - Set fields to fixed values or special expressions ($now, $today, $timestamp)

### v1.3.0 (2026-02-07)
- **14 NEW Transform Types!** Now 20 total transforms available
- **Data Manipulation:** limit, skip, reverse, distinct, flatten
- **Computed Fields:** compute (expressions), concat, split, lookup (value mapping)
- **Aggregation:** group (with sum/avg/count/min/max), summarize (totals row)
- **String Operations:** truncate, pad, mask (email/phone/card/custom)
- Mask supports email, phone, credit card, and custom patterns
- Group supports 8 aggregation operations: sum, avg, count, min, max, first, last, list

### v1.2.0 (2026-02-07)
- **NEW: Data Transforms!** Filter, select, exclude, rename, sort, and format data using YAML
- Added transforms parameter with code editor (YAML syntax)
- Auto-install `js-yaml` dependency on first use
- Transforms execute as pipeline (chained, order matters)
- Comprehensive filter operators: ==, !=, >, <, >=, <=, contains, startswith, endswith
- Format types: date, number, uppercase, lowercase, trim, boolean, default, replace

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
