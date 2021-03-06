const path = require('path');

const { cssSerializer } = require('./css-parser.js');
const hash = require('../utils/hash.js');

const {
  getAbellInBuiltSandbox,
  execRegexOnAll,
  normalizePath,
  prefixHtmlTags,
  getAbellComponentTemplate
} = require('../utils/general-utils.js');

/**
 * Turns <Nav props={hello: 'hi'}/> to {{ Nav({hello: 'hi}).renderedHTML }}
 * @param {string} abellTemplate
 * @return {string}
 */
function componentTagTranspiler(abellTemplate) {
  abellTemplate = String(abellTemplate);
  // eslint-disable-next
  const componentVariables = execRegexOnAll(
    /(?:const|var|let) (\w*) *?= *?require\(["'`](.*?)\.abell["'`]\)/g,
    abellTemplate
  ).matches.map((match) => match[1]);

  if (componentVariables.length <= 0) {
    return abellTemplate;
  }

  let newAbellTemplate = '';
  const componentParseREGEX = new RegExp(
    `\<(${componentVariables.join('|')}).*?(?:props=(.*?))?\/\>`,
    'gs'
  );

  const { matches: componentMatches } = execRegexOnAll(
    componentParseREGEX,
    abellTemplate
  );

  let lastIndex = 0;
  for (const componentMatch of componentMatches) {
    newAbellTemplate +=
      abellTemplate.slice(lastIndex, componentMatch.index) +
      `{{ ${componentMatch[1]}(${componentMatch[2]}).renderedHTML }}`;

    lastIndex = componentMatch[0].length + componentMatch.index;
  }

  newAbellTemplate += abellTemplate.slice(lastIndex);

  return newAbellTemplate;
}

/**
 * Parse string attributes to object
 * @param {string} attrString
 * @return {object}
 */
function parseAttributes(attrString) {
  const attributeMatches = attrString.match(/(?:[^\s"']+|(["'])[^"]*\1)+/g);
  if (!attributeMatches) {
    return {};
  }

  return attributeMatches.reduce((prevObj, val) => {
    const firstEqual = val.indexOf('=');
    if (firstEqual < 0) {
      return {
        ...prevObj,
        [val]: true
      };
    }
    const key = val.slice(0, firstEqual);
    let value = val.slice(firstEqual + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    return {
      ...prevObj,
      [key]: value
    };
  }, {});
}

/**
 * Turns Given Abell Component into JavaScript Component Tree
 * @param {string} abellComponentContent Cotent of Abell Component
 * @param {string} abellComponentPath path of abell component file
 * @param {object} props
 * @param {object} options
 * @return {object}
 */
function parseComponent(
  abellComponentContent,
  abellComponentPath,
  props = {},
  options
) {
  const components = [];
  const basePath = path.dirname(abellComponentPath);

  const newOptions = { ...options, basePath };
  const transformations = {
    '.abell': (abellComponentPath) => {
      const abellComponentContent = getAbellComponentTemplate(
        path.join(basePath, abellComponentPath),
        'utf-8'
      );

      return (props) => {
        const parsedComponent = parseComponent(
          abellComponentContent,
          path.join(basePath, abellComponentPath),
          props,
          newOptions
        );
        components.push(parsedComponent);
        return parsedComponent;
      };
    }
  };
  const builtInFunctions = getAbellInBuiltSandbox(newOptions, transformations);
  const sandbox = {
    props,
    ...builtInFunctions
  };

  const htmlComponentContent = require('../compiler.js').compile(
    abellComponentContent,
    sandbox,
    {
      ...options,
      filename: path.relative(process.cwd(), abellComponentPath)
    }
  );

  const templateTag = /\<template\>(.*?)\<\/template\>/gs.exec(
    htmlComponentContent
  );

  // we use the relative path here so that hash doesn't change across machines
  const componentHash = hash(
    normalizePath(path.relative(process.cwd(), abellComponentPath))
  );

  let template = '';

  if (templateTag) {
    template = templateTag[1];
  }
  if (options && !options.skipHTMLHash) {
    template = prefixHtmlTags(template, componentHash);
  }

  const matchMapper = (isCss) => (contentMatch) => {
    const attributes = parseAttributes(contentMatch[1]);
    const shouldPrefix = isCss && !attributes.global;
    return {
      component: path.basename(abellComponentPath),
      componentPath: abellComponentPath,
      content: shouldPrefix
        ? cssSerializer(contentMatch[2], componentHash)
        : contentMatch[2],
      attributes: parseAttributes(contentMatch[1])
    };
  };

  const styleMatches = execRegexOnAll(
    /\<style(.*?)\>(.*?)\<\/style\>/gs,
    htmlComponentContent
  ).matches.map(matchMapper(true));

  const scriptMatches = execRegexOnAll(
    /\<script(.*?)\>(.*?)\<\/script\>/gs,
    htmlComponentContent
  ).matches.map(matchMapper(false));

  const componentTree = {
    renderedHTML: template,
    components,
    props,
    styles: styleMatches,
    scripts: scriptMatches
  };

  return componentTree;
}

module.exports = {
  parseComponent,
  parseAttributes,
  componentTagTranspiler
};
