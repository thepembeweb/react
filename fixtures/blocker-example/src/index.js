import React from 'react';
import ReactDOM from 'react-dom';
import Markdown from 'react-markdown';
import DEFAULT_INPUT from './README';
import './index.css';

class MarkdownRenderer extends React.PureComponent {
  render() {
    return <Markdown {...this.props} />
  }
}

class App extends React.Component {
  state = {
    input: DEFAULT_INPUT,
    result: DEFAULT_INPUT
  };
  handleChange = (e) => {
    const input = e.target.value;
    Promise.resolve().then(() => {
      ReactDOM.unstable_deferredUpdates(() => {
        this.setState({
          result: input
        });
      })      
    });

    this.setState({
      input
    });
  };
  render() {
    return (
      <React.Fragment>
        <div style={{float: 'left', width: '50%', height: '100%', padding: 40}}>
          <h1>Live Markdown Editor</h1>
          <textarea style={{ width: '100%', height: '100%' }} value={this.state.input} onChange={this.handleChange} />
        </div>
        <div style={{float: 'left', width: '50%', height: '100%', padding: 40}}>
          <h1>Preview</h1>
          <MarkdownRenderer source={this.state.result} />
        </div>
      </React.Fragment>
    );
  }
}


const container = document.getElementById('root');
ReactDOM.render(<App />, container);
