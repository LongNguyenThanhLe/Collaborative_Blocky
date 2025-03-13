import React, { useEffect, useRef, useState } from 'react';
import styles from '../styles/BlocklyWorkspace.module.css';
import { BlocklyOptions } from 'blockly';

const BlocklyWorkspace: React.FC = () => {
  const blocklyDiv = useRef<HTMLDivElement>(null);
  const [workspace, setWorkspace] = useState<any>(null);
  const [generatedCode, setGeneratedCode] = useState<string>('');
  const [showCode, setShowCode] = useState<boolean>(true);

  useEffect(() => {
    let blocklyInstance: any = null;
    
    // Only run on client-side
    if (typeof window === 'undefined' || !blocklyDiv.current) return;
    
    // Dynamically import Blockly
    const initBlockly = async () => {
      try {
        // Import Blockly and necessary components
        const Blockly = await import('blockly');
        const BlocklyJS = await import('blockly/javascript');
        
        // Make sure we have all the blocks we need
        await import('blockly/blocks');

        // Apply custom category styling after load
        const applyCustomStyles = () => {
          // Find all category rows and add data attributes for CSS targeting
          const categoryRows = document.querySelectorAll('.blocklyTreeRow');
          categoryRows.forEach(row => {
            const label = row.querySelector('.blocklyTreeLabel');
            if (label) {
              const category = label.textContent?.toLowerCase().trim();
              if (category) {
                (row as HTMLElement).dataset.category = category;
                
                // Add icon before the category label
                const iconExists = row.querySelector('.category-icon');
                if (!iconExists) {
                  const iconImg = document.createElement('img');
                  iconImg.src = `/images/blockly-icons/${category}.svg`;
                  iconImg.className = 'category-icon';
                  iconImg.alt = `${category} icon`;
                  iconImg.width = 20;
                  iconImg.height = 20;
                  
                  // Insert before the label
                  if (label.parentNode) {
                    label.parentNode.insertBefore(iconImg, label);
                  }
                }
              }
            }
          });
          
          // Improve the flyout appearance for better UX
          const flyoutBtns = document.querySelectorAll('.blocklyFlyoutButton');
          flyoutBtns.forEach(btn => {
            (btn as HTMLElement).style.filter = 'drop-shadow(0px 1px 3px rgba(0,0,0,0.3))';
          });
        };
        
        // Configure workspace
        const options: BlocklyOptions = {
          toolbox: getToolboxConfiguration(),
          grid: {
            spacing: 20,
            length: 3,
            colour: '#ccc',
            snap: true,
          },
          trashcan: true,
          zoom: {
            controls: true,
            wheel: true,
            startScale: 1.0,
            maxScale: 3,
            minScale: 0.3,
            scaleSpeed: 1.2,
          },
          move: {
            scrollbars: true,
            drag: true,
            wheel: true
          },
          comments: true,
          collapse: true,
          sounds: true,
          media: 'https://blockly-demo.appspot.com/static/media/',
          renderer: 'geras',
          // Removing theme property as it's causing TypeScript errors
        };
        
        // Clear any previous workspace
        if (blocklyDiv.current) {
          blocklyDiv.current.innerHTML = '';
        }
        
        // Create the Blockly workspace - Fix the null issue by asserting non-null
        const newWorkspace = Blockly.inject(blocklyDiv.current!, options);
        setWorkspace(newWorkspace);
        blocklyInstance = newWorkspace;
        
        // Apply our custom styling to the toolbox categories
        setTimeout(applyCustomStyles, 100);
        
        // Add change listener to generate code
        const updateCode = () => {
          try {
            const code = BlocklyJS.javascriptGenerator.workspaceToCode(newWorkspace);
            setGeneratedCode(code);
            console.log("Generated code:", code);
          } catch (err) {
            console.error("Error generating code:", err);
          }
        };
        
        // Register for changes to the workspace
        newWorkspace.addChangeListener((e: any) => {
          // Only update when changes are done (not during drags, etc)
          if (e.type === Blockly.Events.BLOCK_MOVE ||
              e.type === Blockly.Events.BLOCK_CHANGE ||
              e.type === Blockly.Events.BLOCK_CREATE ||
              e.type === Blockly.Events.BLOCK_DELETE) {
            updateCode();
          }
        });

        // Re-apply styles when toolbox changes are made
        newWorkspace.addChangeListener((e: any) => {
          if (e.type === Blockly.Events.TOOLBOX_ITEM_SELECT) {
            setTimeout(applyCustomStyles, 200); // Increased timeout for more reliable icon insertion
          }
        });
        
        // Also reapply styles on window resize to ensure icons stay in place
        window.addEventListener('resize', () => {
          setTimeout(applyCustomStyles, 200);
        });
      } catch (error) {
        console.error("Error initializing Blockly:", error);
      }
    };

    initBlockly();
    
    // Clean up on unmount
    return () => {
      if (blocklyInstance) {
        blocklyInstance.dispose();
      }
      // Remove resize listener
      window.removeEventListener('resize', () => {});
    };
  }, []);

  const clearWorkspace = () => {
    if (workspace) {
      workspace.clear();
    }
  };

  const toggleCodeVisibility = () => {
    setShowCode(!showCode);
  };

  const getToolboxConfiguration = () => {
    return {
      kind: 'categoryToolbox',
      contents: [
        {
          kind: 'category',
          name: 'Logic',
          categorystyle: 'logic_category',
          colour: '#5b80a5',
          contents: [
            { kind: 'block', type: 'controls_if' },
            { kind: 'block', type: 'logic_compare' },
            { kind: 'block', type: 'logic_operation' },
            { kind: 'block', type: 'logic_negate' },
            { kind: 'block', type: 'logic_boolean' },
            { kind: 'block', type: 'logic_null' },
            { kind: 'block', type: 'logic_ternary' },
          ],
        },
        {
          kind: 'category',
          name: 'Loops',
          categorystyle: 'loop_category',
          colour: '#5ba55b',
          contents: [
            { kind: 'block', type: 'controls_repeat_ext' },
            { kind: 'block', type: 'controls_whileUntil' },
            { kind: 'block', type: 'controls_for' },
            { kind: 'block', type: 'controls_forEach' },
            { kind: 'block', type: 'controls_flow_statements' },
          ],
        },
        {
          kind: 'category',
          name: 'Math',
          categorystyle: 'math_category',
          colour: '#5b67a5',
          contents: [
            { kind: 'block', type: 'math_number' },
            { kind: 'block', type: 'math_arithmetic' },
            { kind: 'block', type: 'math_single' },
            { kind: 'block', type: 'math_trig' },
            { kind: 'block', type: 'math_constant' },
            { kind: 'block', type: 'math_number_property' },
            { kind: 'block', type: 'math_round' },
            { kind: 'block', type: 'math_on_list' },
            { kind: 'block', type: 'math_modulo' },
            { kind: 'block', type: 'math_constrain' },
            { kind: 'block', type: 'math_random_int' },
            { kind: 'block', type: 'math_random_float' },
            { kind: 'block', type: 'math_atan2' },
          ],
        },
        {
          kind: 'category',
          name: 'Text',
          categorystyle: 'text_category',
          colour: '#5ba58c',
          contents: [
            { kind: 'block', type: 'text' },
            { kind: 'block', type: 'text_join' },
            { kind: 'block', type: 'text_append' },
            { kind: 'block', type: 'text_length' },
            { kind: 'block', type: 'text_isEmpty' },
            { kind: 'block', type: 'text_indexOf' },
            { kind: 'block', type: 'text_charAt' },
            { kind: 'block', type: 'text_getSubstring' },
            { kind: 'block', type: 'text_changeCase' },
            { kind: 'block', type: 'text_trim' },
            { kind: 'block', type: 'text_print' },
            { kind: 'block', type: 'text_prompt_ext' },
          ],
        },
        {
          kind: 'category',
          name: 'Lists',
          categorystyle: 'list_category',
          colour: '#745ba5',
          contents: [
            { kind: 'block', type: 'lists_create_with' },
            { kind: 'block', type: 'lists_create_empty' },
            { kind: 'block', type: 'lists_repeat' },
            { kind: 'block', type: 'lists_length' },
            { kind: 'block', type: 'lists_isEmpty' },
            { kind: 'block', type: 'lists_indexOf' },
            { kind: 'block', type: 'lists_getIndex' },
            { kind: 'block', type: 'lists_setIndex' },
            { kind: 'block', type: 'lists_getSublist' },
            { kind: 'block', type: 'lists_split' },
            { kind: 'block', type: 'lists_sort' },
          ],
        },
        {
          kind: 'category',
          name: 'Variables',
          categorystyle: 'variable_category',
          colour: '#a55b80',
          custom: 'VARIABLE',
        },
        {
          kind: 'category',
          name: 'Functions',
          categorystyle: 'procedure_category',
          colour: '#995ba5',
          custom: 'PROCEDURE',
        },
      ],
    };
  };

  return (
    <div className={styles.blocklyContainer}>
      <div className={styles.actionButtons}>
        <button 
          className={styles.actionButton} 
          onClick={clearWorkspace}
          title="Clear Workspace"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18"></path>
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
          </svg>
          <span>Clear</span>
        </button>
        <button 
          className={styles.actionButton} 
          onClick={toggleCodeVisibility}
          title={showCode ? "Hide Code" : "Show Code"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="16 18 22 12 16 6"></polyline>
            <polyline points="8 6 2 12 8 18"></polyline>
          </svg>
          <span>{showCode ? "Hide Code" : "Show Code"}</span>
        </button>
      </div>
      <div ref={blocklyDiv} className={styles.blocklyDiv} />
      {showCode && (
        <div className={styles.codeOutput}>
          <h3>Generated Code:</h3>
          <pre className={styles.codeBlock}>
            <code>{generatedCode || '// No code generated yet'}</code>
          </pre>
        </div>
      )}
    </div>
  );
};

export default BlocklyWorkspace;
