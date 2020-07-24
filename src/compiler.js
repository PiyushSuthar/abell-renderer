const execute = require('./execute.js');
const { execRegexOnAll } = require('./render-utils.js');

/**
 * @param {String} abellTemplate
 * @param {Object} sandbox
 * @return {String}
 */
function compile(abellTemplate, sandbox) {
  // Finds all the JS expressions to be executed.
  const { matches, input } = execRegexOnAll(/\\?{{(.+?)}}/gs, abellTemplate);
  let renderedHTML = '';
  let lastIndex = 0;

  for (const match of matches) {
    // Loops Through JavaScript blocks inside '{{' and '}}'
    let value = '';
    if (match[0].startsWith('\\{{')) {
      // Its a comment! e.g. \{{ print this as it is }}
      // Ignore the match that starts with slash '\' and return the same value without slash
      value = match[0].slice(1);
    } else if (match[0].match(/\{{.\s*}}/)) {
      // removes empty brackets.
      // e.g. <div>{{ }}</div> renders <div></div>
      value = '';
    } else if (match[1].match(/} ?=/g) !== null) {
      // Condition to check if the block has destructuring

      // destructured elements need to be executed line by line.
      const lines = match[1]
        .trim()
        .split(/[\n;]/)
        .filter((line) => line.trim() !== '');

      for (const line of lines) {
        ({ sandbox } = execute(line, sandbox));
      }
    } else {
      // Executes the block directly
      const executionInfo = execute(match[1], sandbox);
      if (executionInfo.type === 'assignment') {
        sandbox = executionInfo.sandbox;
      } else if (executionInfo.type === 'value') {
        value = executionInfo.value;
      } else {
        sandbox = executionInfo.sandbox;
      }
    }

    /**
     * Removes the JavaScript line before adding to HTML
     * if the script returns value, adds it to the HTML
     */

    const toAddOnIndex = match.index; // Gets the index where the executed value is to be put.
    renderedHTML += input.slice(lastIndex, toAddOnIndex) + String(value).trim();
    lastIndex = toAddOnIndex + match[0].length;
  }

  renderedHTML += input.slice(lastIndex);
  return renderedHTML;
}

module.exports = { compile };
