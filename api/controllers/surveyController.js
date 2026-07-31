const crypto = require('crypto');
const { Survey, SurveyResponse, QUESTION_TYPES } = require('../models/Asset');

function normalizeQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return { error: 'At least one question is required.' };
  }

  const questions = [];
  for (const [index, item] of rawQuestions.entries()) {
    const prompt = String(item?.prompt || '').trim();
    const type = String(item?.type || '').trim().toLowerCase();

    if (!prompt) {
      return { error: `Question ${index + 1} needs a prompt.` };
    }
    if (!QUESTION_TYPES.includes(type)) {
      return {
        error: `Question ${index + 1} type must be one of: ${QUESTION_TYPES.join(', ')}.`,
      };
    }

    let options = Array.isArray(item.options)
      ? item.options.map((opt) => String(opt).trim()).filter(Boolean)
      : [];

    if (type === 'multiple_choice' && options.length < 2) {
      return { error: `Question ${index + 1} (multiple choice) needs at least two options.` };
    }
    if (type === 'yes_no') {
      options = ['Yes', 'No'];
    }
    if (type === 'text') {
      options = [];
    }

    questions.push({
      questionId: item.questionId || crypto.randomUUID(),
      prompt,
      type,
      options,
      required: item.required !== false,
    });
  }

  return { questions };
}

function validateAnswers(survey, answers) {
  if (!Array.isArray(answers) || answers.length === 0) {
    return { error: 'At least one answer is required.' };
  }

  const byId = new Map(survey.questions.map((q) => [q.questionId, q]));
  const normalized = [];

  for (const question of survey.questions) {
    const answer = answers.find((a) => a.questionId === question.questionId);
    if (!answer || answer.value === undefined || answer.value === null || answer.value === '') {
      if (question.required) {
        return { error: `Missing answer for: ${question.prompt}` };
      }
      continue;
    }

    const value = answer.value;

    if (question.type === 'text') {
      if (typeof value !== 'string') {
        return { error: `Answer for "${question.prompt}" must be text.` };
      }
      normalized.push({ questionId: question.questionId, value: value.trim() });
    } else if (question.type === 'yes_no') {
      const asBool =
        value === true ||
        value === false ||
        String(value).toLowerCase() === 'yes' ||
        String(value).toLowerCase() === 'no';
      if (!asBool) {
        return { error: `Answer for "${question.prompt}" must be Yes or No.` };
      }
      const yes = value === true || String(value).toLowerCase() === 'yes';
      normalized.push({ questionId: question.questionId, value: yes ? 'Yes' : 'No' });
    } else if (question.type === 'multiple_choice') {
      const choice = String(value);
      if (!question.options.includes(choice)) {
        return { error: `Answer for "${question.prompt}" must be one of the options.` };
      }
      normalized.push({ questionId: question.questionId, value: choice });
    }
  }

  for (const answer of answers) {
    if (!byId.has(answer.questionId)) {
      return { error: `Unknown question id: ${answer.questionId}` };
    }
  }

  return { answers: normalized };
}

function buildResponseSummary(survey, responses) {
  const questions = survey.questions.map((question) => {
    const counts = {};
    const textAnswers = [];

    if (question.type === 'multiple_choice' || question.type === 'yes_no') {
      for (const option of question.options) {
        counts[option] = 0;
      }
    }

    for (const response of responses) {
      const answer = response.answers.find((a) => a.questionId === question.questionId);
      if (!answer) continue;

      if (question.type === 'text') {
        textAnswers.push({
          responseId: response._id,
          respondent: response.createdBy,
          value: answer.value,
          submittedAt: response.createdAt,
        });
      } else {
        const key = String(answer.value);
        counts[key] = (counts[key] || 0) + 1;
      }
    }

    return {
      questionId: question.questionId,
      prompt: question.prompt,
      type: question.type,
      options: question.options,
      counts: question.type === 'text' ? undefined : counts,
      textAnswers: question.type === 'text' ? textAnswers : undefined,
      totalAnswered:
        question.type === 'text'
          ? textAnswers.length
          : Object.values(counts).reduce((sum, n) => sum + n, 0),
    };
  });

  return {
    surveyId: survey._id,
    surveyName: survey.name,
    responseCount: responses.length,
    questions,
  };
}

exports.listSurveys = async (req, res) => {
  try {
    const surveys = await Survey.find({})
      .sort({ updatedAt: -1 })
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');
    res.status(200).json(surveys);
  } catch (error) {
    res.status(500).json({ message: 'Error listing surveys', error: error.message });
  }
};

exports.createSurvey = async (req, res) => {
  try {
    const { name, description, questions: rawQuestions } = req.body;
    if (!name || !String(name).trim()) {
      return res.status(400).json({ message: 'Survey name is required.' });
    }

    const normalized = normalizeQuestions(rawQuestions);
    if (normalized.error) {
      return res.status(400).json({ message: normalized.error });
    }

    const survey = await Survey.create({
      name: String(name).trim(),
      description: description || '',
      kind: 'SURVEY',
      questions: normalized.questions,
      ownerId: req.user._id,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    res.status(201).json(survey);
  } catch (error) {
    res.status(500).json({ message: 'Error creating survey', error: error.message });
  }
};

exports.getSurveyById = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id)
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }
    res.status(200).json(survey);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching survey', error: error.message });
  }
};

exports.updateSurvey = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }

    if (req.body.name !== undefined) survey.name = String(req.body.name).trim();
    if (req.body.description !== undefined) survey.description = req.body.description;
    if (req.body.questions !== undefined) {
      const normalized = normalizeQuestions(req.body.questions);
      if (normalized.error) {
        return res.status(400).json({ message: normalized.error });
      }
      survey.questions = normalized.questions;
    }

    survey.updatedBy = req.user._id;
    await survey.save();
    res.status(200).json(survey);
  } catch (error) {
    res.status(500).json({ message: 'Error updating survey', error: error.message });
  }
};

exports.deleteSurvey = async (req, res) => {
  try {
    const survey = await Survey.findByIdAndDelete(req.params.id);
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }
    await SurveyResponse.deleteMany({ surveyId: survey._id });
    res.status(200).json({ message: 'Survey and related responses deleted.' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting survey', error: error.message });
  }
};

exports.submitSurveyResponse = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }

    const validated = validateAnswers(survey, req.body.answers);
    if (validated.error) {
      return res.status(400).json({ message: validated.error });
    }

    const response = await SurveyResponse.create({
      name: `Response: ${survey.name}`,
      description: `Submitted response for survey ${survey._id}`,
      kind: 'SURVEY_RESPONSE',
      surveyId: survey._id,
      answers: validated.answers,
      ownerId: req.user._id,
      createdBy: req.user._id,
      updatedBy: req.user._id,
    });

    res.status(201).json(response);
  } catch (error) {
    res.status(500).json({ message: 'Error submitting survey response', error: error.message });
  }
};

exports.listSurveyResponses = async (req, res) => {
  try {
    const survey = await Survey.findById(req.params.id);
    if (!survey) {
      return res.status(404).json({ message: 'Survey not found.' });
    }

    const responses = await SurveyResponse.find({ surveyId: survey._id })
      .sort({ createdAt: -1 })
      .populate('createdBy', 'username email')
      .populate('updatedBy', 'username email');

    res.status(200).json({
      survey,
      responses,
      summary: buildResponseSummary(survey, responses),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error listing survey responses', error: error.message });
  }
};
