async function setUpSearch() {
  const shell = require('shell'); // see https://www.electronjs.org/docs/latest/api/shell

  async function prepareSearchIndex() {
    const response = await fetch('https://developer.mozilla.org/en-US/search-index.json');
    const data = await response.json();
    return data;
  }
  const mdnSearchIndex = await prepareSearchIndex();

  atom.commands.add('atom-workspace', 'mdn-search:search', async function(e) {
    const state = {
      selectedSuggestionIndex: 0,
      suggestions: [],
    };

    let overlay = document.querySelector('#yaphi-mdn-lookup');
    if (!overlay) {

      const THEMES = {
        DEFAULT: 'yaphi-mdn-lookup-theme-default',
        DARK: 'yaphi-mdn-lookup-theme-dark',
      };

      const selectedTheme = THEMES.DARK;

      const style = document.createElement('style');
      style.textContent = `
        .${THEMES.DARK} {
          --overlay-background: #180044aa;

          --input-background: #0005;
          --input-color: #bbb;

          --suggestions-background: #0008;
          --suggestion-color: #bbb;

          --highlight-background: #2e3333;
          --highlight-color: #ddd;
        }

        #yaphi-mdn-lookup {
          background: var(--overlay-background, #000a);
          font-family: monospace;
          position: absolute;
          top: 0px;
          left: 0px;
          width: 100%;
          height: 100%;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          box-sizing: border-box;
          padding: 120px 20px 20px;
          opacity: 0;
          transition: opacity 0.2s;
          pointer-events: none;
        }

        #yaphi-mdn-lookup .input-container {
          position: relative;
        }

        #yaphi-mdn-lookup input {
          font-family: monospace;
          font-size: 40px;
          padding: 20px;
          width: 800px;
          max-width: 100%;
          color: var(--input-color, #334);
          background: var(--input-background, #eee);
          border-radius: 10px;
          border: 2px solid #aaa;
          box-shadow: 0px 0px 55px #0ff;
        }

        .suggestions {
          position: absolute;
          top: 100%;
          left: 0px;
          width: 100%;
          box-sizing: border-box;
          background: var(--suggestions-background, #eee);
          opacity: 0;
          transition: opacity 0.2s;
          pointer-events: none;
          border-radius: 5px;
          overflow: hidden;
        }

        .suggestion {
          border-bottom: 1px solid #aaa;
          color: var(--suggestion-color, #345);
          display: block;
          padding: 15px 20px;
        }

        /*
        .suggestion:hover {
          background: gold;
          color: #345;
        }
        */

        .suggestion-title {
          font-size: 20px;
        }
      `;
      document.body.appendChild(style);

      function buildHighlightStyles({ suggestionIndex }) {
        return (`
          .suggestion:nth-of-type(${suggestionIndex + 1}) {
            background: var(--highlight-background, #c5dada);
            color: var(--highlight-color, #345);
          }
        `);
      }

      overlay = document.createElement('div');
      overlay.setAttribute('id', 'yaphi-mdn-lookup');
      overlay.classList.add(selectedTheme);
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          hideOverlay(overlay);
        }
      });

      overlay.innerHTML = `
        <div class="input-container">
          <input type="text" placeholder="Search MDN" />
          <div class="suggestions"></div>
        </div>
      `;

      const input = overlay.querySelector('input');

      input.addEventListener('keydown', function(e) {
        e.stopPropagation(); // prevent atom from blocking certain keys
        const KEYCODES = {
          ESCAPE: 27,
          ENTER: 13,
          SPACE: 32,
          ARROW_DOWN: 40,
          ARROW_UP: 38,
        };

        if (e.keyCode === KEYCODES.ESCAPE) {
          hideOverlay(overlay);
        }
        if (e.altKey && e.keyCode === KEYCODES.SPACE) {
          hideOverlay(overlay);
        }
        if (e.keyCode === KEYCODES.ENTER && !isInputEmpty(input)) {
          const path = state.suggestions[state.selectedSuggestionIndex].url;
          const url = 'https://developer.mozilla.org' + path;
          shell.openExternal(url);
          hideOverlay(overlay);
        }
        if (e.keyCode === KEYCODES.ARROW_DOWN && state.suggestions.length) {
          state.selectedSuggestionIndex = (state.selectedSuggestionIndex + 1) % state.suggestions.length;
          highlightSuggestion(state.selectedSuggestionIndex);
        }
        if (e.keyCode === KEYCODES.ARROW_UP && state.suggestions.length) {
          e.preventDefault(); // stop cursor from moving to beginning of text input
          state.selectedSuggestionIndex = (state.selectedSuggestionIndex + state.suggestions.length - 1) % state.suggestions.length;
          highlightSuggestion(state.selectedSuggestionIndex);
        }
      });

      input.addEventListener('input', async function(e) {
        if (isInputEmpty(input)) {
          hideSuggestions();
          return;
        }
        resetSuggestionState();
        state.suggestions = await getSearchSuggestions({
          query: input.value,
          searchIndex: mdnSearchIndex,
        });
        showSuggestions(state.suggestions);
        highlightSuggestion(state.selectedSuggestionIndex);
      });

      document.body.appendChild(overlay);
    }
    const suggestionsContainer = overlay.querySelector('.suggestions');

    showOverlay(overlay);

    function showOverlay(overlay) {
      overlay.querySelector('input').value = '';
      overlay.style.opacity = 1;
      overlay.style.pointerEvents = 'auto';
      overlay.querySelector('input').focus();
    }

    function hideOverlay(overlay) {
      overlay.style.opacity = 0;
      overlay.style.pointerEvents = 'none';
      hideSuggestions();
      overlay.querySelector('input').blur();
    }

    function showSuggestions(suggestions) {
      suggestionsContainer.style.opacity = 1;
      suggestionsContainer.style.pointerEvents = 'auto';
      suggestionsContainer.innerHTML = suggestions.map(suggestion => {
        return (`
          <a class="suggestion" href="https://developer.mozilla.org/${suggestion.url}">
            <div class="suggestion-title">${stringifyHtml(suggestion.title)}</div>
            <div class="suggestion-url">${suggestion.url}</div>
          </a>
        `);
      }).join('');
    }

    function highlightSuggestion(n) {
      let highlighter = document.querySelector('#mdn-autosuggest-highlighter');
      if (!highlighter) {
        highlighter = buildHighlighter();
      }
      highlighter.textContent = buildHighlightStyles({ suggestionIndex: n });
    }

    function buildHighlighter() {
      const style = document.createElement('style');
      style.setAttribute('id', 'mdn-autosuggest-highlighter');
      document.body.appendChild(style);
      return style;
    }

    function hideSuggestions() {
      resetSuggestionState();
      suggestionsContainer.style.opacity = 0;
      suggestionsContainer.style.pointerEvents = 'none';
      suggestionsContainer.innerHTML = '';
    }

    function resetSuggestionState() {
      state.suggestions = [];
      state.selectedSuggestionIndex = 0;
    }

    function stringifyHtml(html) {
      return html.replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    function isInputEmpty(input) {
      return !input.value || input.value.trim() === '';
    }

    function getSearchSuggestions({ query, searchIndex }) {
      const suggestions = [];
      if (query === '') { return suggestions; }
      const queryWords = query.split(' ');
      const defaultSuggestion = {
        title: `Site search for: ${query}`,
        url: `/en-US/search?q=${query}`,
      };

      for (suggestion of searchIndex) {
        if (doesStringHaveAllWords({
          string: suggestion.title,
          words: queryWords
        })) {
          suggestions.push(suggestion);
        }
        if (suggestions.length >= 5) {
          suggestions.push(defaultSuggestion);
          return suggestions;
        }
      }

      suggestions.push(defaultSuggestion);
      return suggestions;
    }

    function doesStringHaveAllWords({ string, words }) {
      const lowerCased = {
        string: string.toLowerCase(),
        words: words.map(word => word.toLowerCase()),
      };
      let hasAllWords = true;
      lowerCased.words.forEach(word => {
        if (!lowerCased.string.includes(word)) {
          hasAllWords = false;
        }
      });
      return hasAllWords;
    }
  });

  /*
  TODO:
    - bold/highlight queries in suggestions (maybe not; might have overlapping words)
    - split functions
    - add theming layer
  */
}

export default {
  activate() {
    setUpSearch();
  }
}
