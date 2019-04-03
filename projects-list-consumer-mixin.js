/**
@license
Copyright 2018 The Advanced REST client authors <arc@mulesoft.com>
Licensed under the Apache License, Version 2.0 (the "License"); you may not
use this file except in compliance with the License. You may obtain a copy of
the License at
http://www.apache.org/licenses/LICENSE-2.0
Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the
License for the specific language governing permissions and limitations under
the License.
*/
import {dedupingMixin} from '../../@polymer/polymer/lib/utils/mixin.js';
import {afterNextRender} from '../../@polymer/polymer/lib/utils/render-status.js';
/**
 * A mixin with common methods for (legacy) projects list.
 * Use it for components that reads list of projects and requires to keep track
 * of changes in a project object.
 *
 * @polymer
 * @mixinFunction
 * @memberof ArcComponents
 */
export const ProjectsListConsumerMixin = dedupingMixin((base) => {
  /**
   * @polymer
   * @mixinClass
   */
  class ProjectsListConsumerMixin extends base {
    static get properties() {
      return {
        /**
         * List of available projects.
         */
        projects: Array,
        /**
         * Computed value, true if any project is on the list.
         */
        hasProjects: {
          type: Boolean,
          computed: '_computeHasProjects(projects.*)',
          value: false,
          notify: true
        },
        /**
         * When set the element won't request projects list when attached to the dom.
         * When set `refreshProjects()` has to be called manually.
         */
        noAutoProjects: Boolean
      };
    }

    constructor() {
      super();
      this._projectChangedHandler = this._projectChangedHandler.bind(this);
      this._projectDeletedHandler = this._projectDeletedHandler.bind(this);
      this._projectDatabaseDestroyedHandler = this._projectDatabaseDestroyedHandler.bind(this);
      this._projectDataImportHandler = this._projectDataImportHandler.bind(this);
    }

    connectedCallback() {
      super.connectedCallback();
      window.addEventListener('project-object-changed', this._projectChangedHandler);
      window.addEventListener('project-object-deleted', this._projectDeletedHandler);
      window.addEventListener('datastore-destroyed', this._projectDatabaseDestroyedHandler);
      window.addEventListener('data-imported', this._projectDataImportHandler);
      if (!this.noAutoProjects && !this.projects) {
        this.refreshProjects();
      }
    }

    disconnectedCallback() {
      super.disconnectedCallback();
      window.removeEventListener('project-object-changed', this._projectChangedHandler);
      window.removeEventListener('project-object-deleted', this._projectDeletedHandler);
      window.removeEventListener('datastore-destroyed', this._projectDatabaseDestroyedHandler);
      window.removeEventListener('data-imported', this._projectDataImportHandler);
    }
    /**
     * Computes value for `hasProjects` property
     * @param {Object} record Polymer change record
     * @return {Boolean}
     */
    _computeHasProjects(record) {
      return !!(record && record.base && record.base.length);
    }
    /**
     * Refreshes projects list when ARC data were imported.
     * @param {CustomEvent} e
     */
    _projectDataImportHandler(e) {
      if (e.cancelable) {
        return;
      }
      this.refreshProjects();
    }
    /**
     * Handler for `datastore-destroyed` custom event.
     * Refreshes list of projects afyter clearing the data.
     * @param {CustomEvent} e
     */
    _projectDatabaseDestroyedHandler(e) {
      let store = e.detail.datastore;
      if (typeof store === 'string') {
        store = [store];
      }
      if (store instanceof Array) {
        if (store.indexOf('legacy-projects') === -1 && store.indexOf('all') === -1) {
          return;
        }
      } else {
        return;
      }
      this.set('projects', undefined);
      this.refreshProjects();
    }
    /**
     * Refreshes the list of projects after next render frame.
     */
    refreshProjects() {
      if (this.__refreshingDebouncer) {
        return;
      }
      this.__refreshingDebouncer = true;
      afterNextRender(this, () => {
        this.__refreshingDebouncer = false;
        this._updateProjectsList();
      });
    }
    /**
     * Handler for non-cancelable `project-object-changed` event.
     * Updates the project on projects list or adds it if it's new project.
     * @param {CustomEvent} e
     */
    _projectChangedHandler(e) {
      if (e.cancelable) {
        return;
      }
      const {project} = e.detail;
      if (!project || !project._id) {
        return;
      }
      const projects = this.projects;
      if (!projects || !projects.length) {
        this.set('projects', [project]);
        return;
      }
      for (let i = 0, len = projects.length; i < len; i++) {
        if (projects[i]._id === project._id) {
          this.set(`projects.${i}`, project);
          return;
        }
      }
      // As a new project it always gonna be at the end.
      this.push('projects', project);
    }
    /**
     * Handler for `project-object-deleted` custom event.
     * Removes a project from the list if applicable.
     * This will not handle cancelable events.
     * @param {CustomEvent} e
     */
    _projectDeletedHandler(e) {
      const projects = this.projects;
      if (e.cancelable || !projects || !projects.length) {
        return;
      }
      const {id} = e.detail;
      if (!id) {
        return;
      }
      for (let i = 0, len = projects.length; i < len; i++) {
        if (projects[i]._id === id) {
          this.splice('projects', i, 1);
          return;
        }
      }
    }
    /**
     * Dispatches `project-model-query` custom event and returns it.
     * @return {CustomEvent}
     */
    _dispatchProjectQueryEvent() {
      const e = new CustomEvent('project-model-query', {
        bubbles: true,
        composed: true,
        cancelable: true,
        detail: {}
      });
      this.dispatchEvent(e);
      return e;
    }
    /**
     * Updates list of available projects after the overlay is opened.
     * @return {Promise}
     */
    _updateProjectsList() {
      const e = this._dispatchProjectQueryEvent();
      if (!e.defaultPrevented) {
        this._handleProjectsError(new Error('The project-model is not in the DOM.'));
        return;
      }
      return e.detail.result
      .then((result) => result.sort(this._projectsSortFn))
      .then((result) => {
        this.set('projects', result);
        afterNextRender(this, () => {
          if (this.notifyResize) {
            this.notifyResize();
          }
        });
      })
      .catch((cause) => this._handleProjectsError(cause));
    }
    /**
     * Sort function used to sort projects in order.
     * @param {Object} a
     * @param {Object} b
     * @return {Number}
     */
    _projectsSortFn(a, b) {
      if (a.order === b.order) {
        return 0;
      }
      if (a.order > b.order) {
        return 1;
      }
      if (a.order < b.order) {
        return -1;
      }
    }
    /**
     * Computes a list of suggestion for autocomplete element.
     * From the list of `projects` it takes names for each project and returns
     * new list for suggestions.
     * @param {Array<Object>} projects
     * @return {Array<String>}
     */
    _computeProjectsAutocomplete(projects) {
      if (!projects || !projects.length) {
        return;
      }
      if (!(projects instanceof Array)) {
        console.warn('Projects list is not a list');
        return;
      }
      const result = [];
      projects.forEach((item) => {
        if (item.name) {
          result[result.length] = item.name;
        }
      });
      return result;
    }
    /**
     * Handles errors.
     *
     * @param {Error} cause Error object
     */
    _handleProjectsError(cause) {
      this.dispatchEvent(new CustomEvent('send-analytics', {
        bubbles: true,
        composed: true,
        detail: {
          type: 'exception',
          description: '[projects-list-consumer]: ' + cause.message,
          fatal: false
        }
      }));
      console.warn(cause);
      throw cause;
    }
    /**
     * Processes projects name list and returns object with
     * `add` property as a list of project names that do not yet exists and
     * `existing` property with a list of IDs of existing projects.
     *
     * @param {Array<String>} selectedProjects List of selected projects to process.
     * @return {Object}
     * - `add` {Array<String>} List of names of a projects to create
     * - `existing` {Array<String>} List of IDs of existing projects
     */
    _processSelectedProjectsInfo(selectedProjects) {
      const result = {
        add: [],
        existing: []
      };
      if (!selectedProjects || !selectedProjects.length) {
        return result;
      }
      const projects = this.projects || [];
      const projectsLength = projects.length;
      for (let i = 0, len = selectedProjects.length; i < len; i++) {
        const selected = selectedProjects[i];
        if (!selected) {
          continue;
        }
        const lowerSelected = selected.toLowerCase();
        let hasProject = false;
        for (let j = 0; j < projectsLength; j++) {
          if (projects[j].name.toLowerCase() === lowerSelected) {
            result.existing.push(projects[j]._id);
            hasProject = true;
            break;
          }
        }
        if (!hasProject) {
          result.add.push(selected);
        }
      }
      return result;
    }
  }
  return ProjectsListConsumerMixin;
});