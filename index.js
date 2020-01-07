const axios = require('axios')
const parse = require('papaparse')
const chalk = require('chalk')
const path = require('path')
const config = require('./config.js')

//TODO
//Polling



const fileList = fs.readdirSync("./", (err,files) => { return files })

const filteredList = fileList.filter(file => {
  return path.extname(file).toLowerCase() === ext
})

inquirer
  .prompt([
    {
      type: "input",
      name: "domain",
      message: "What is the domain? "
    },
    {
      type: "list",
      name: "filePath",
      message:  "Please select your csv",
      choices: filteredList
    }
  ])
  .then()


function triggerExport (answers,course) {
  return axios
  .get(`https://${answers.domain}.instructure.com/api/v1/courses/${course.course_id}/content_exports`,{
    headers: {
      "Authorization": `Bearer ${config.token}`
    }
  })
}

function checkProgress () {

}