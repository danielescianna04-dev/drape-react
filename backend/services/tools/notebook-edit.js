/**
 * NotebookEdit Tool
 * Edit cells in Jupyter notebooks (.ipynb files)
 * Based on Claude Code's NotebookEdit tool specification
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Edit a cell in a Jupyter notebook
 * @param {string} notebook_path - Absolute path to .ipynb file
 * @param {string} cell_id - ID of the cell to edit (or undefined for cell_number)
 * @param {number} cell_number - 0-indexed cell number
 * @param {string} new_source - New source code/markdown for the cell
 * @param {string} cell_type - Type of cell ("code" or "markdown")
 * @param {string} edit_mode - Edit mode ("replace", "insert", "delete")
 * @returns {Promise<Object>} Edit result
 */
async function notebookEdit({
    notebook_path,
    cell_id,
    cell_number,
    new_source,
    cell_type,
    edit_mode = 'replace'
}) {
    try {
        // Read notebook file
        const notebookContent = await fs.readFile(notebook_path, 'utf-8');
        const notebook = JSON.parse(notebookContent);

        if (!notebook.cells || !Array.isArray(notebook.cells)) {
            return {
                success: false,
                error: 'Invalid notebook format: missing cells array'
            };
        }

        let targetCellIndex = -1;

        // Find cell by ID or number
        if (cell_id) {
            targetCellIndex = notebook.cells.findIndex(c => c.id === cell_id);
        } else if (cell_number !== undefined) {
            targetCellIndex = cell_number;
        }

        if (edit_mode === 'delete') {
            // Delete cell
            if (targetCellIndex < 0 || targetCellIndex >= notebook.cells.length) {
                return {
                    success: false,
                    error: `Cell not found at index ${targetCellIndex}`
                };
            }

            notebook.cells.splice(targetCellIndex, 1);

        } else if (edit_mode === 'insert') {
            // Insert new cell
            const newCell = {
                cell_type: cell_type || 'code',
                execution_count: null,
                metadata: {},
                outputs: [],
                source: new_source.split('\n')
            };

            if (cell_id) {
                // Insert after cell with cell_id
                const afterIndex = notebook.cells.findIndex(c => c.id === cell_id);
                notebook.cells.splice(afterIndex + 1, 0, newCell);
            } else {
                // Insert at beginning
                notebook.cells.unshift(newCell);
            }

        } else {
            // Replace cell content
            if (targetCellIndex < 0 || targetCellIndex >= notebook.cells.length) {
                return {
                    success: false,
                    error: `Cell not found at index ${targetCellIndex}`
                };
            }

            const cell = notebook.cells[targetCellIndex];
            cell.source = new_source.split('\n');

            if (cell_type) {
                cell.cell_type = cell_type;
            }

            // Clear outputs for code cells
            if (cell.cell_type === 'code') {
                cell.outputs = [];
                cell.execution_count = null;
            }
        }

        // Write back to file
        await fs.writeFile(
            notebook_path,
            JSON.stringify(notebook, null, 2),
            'utf-8'
        );

        return {
            success: true,
            notebook_path,
            edit_mode,
            cells_count: notebook.cells.length
        };

    } catch (error) {
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = { notebookEdit };
